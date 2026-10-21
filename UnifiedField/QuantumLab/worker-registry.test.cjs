'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBlueprint, REQUIRED_ADVERSARIAL_PROFILES } = require('./worker-forge.cjs');
const { createWorkerRegistry } = require('./worker-registry.cjs');

function fixtureBlueprint() {
  return {
    id: 'hf-registry-worker',
    version: '1.0.0',
    role: 'registry test worker',
    objective: 'Store candidate metadata and test results with explicit evidence and reproducible state.',
    input_schema: { type: 'object', required: ['task_id'] },
    output_schema: { type: 'object', required: ['status', 'evidence_refs'] },
    capabilities: ['read_local_artifacts', 'request_peer_review'],
    forbidden_capabilities: ['unbounded_shell', 'credential_exfiltration', 'stealth_persistence'],
    execution: { mode: 'proposal_only', max_tool_calls: 4 },
    axes: {
      task_type: ['build'],
      risk_class: ['LOW'],
      evidence_quality: ['verified'],
      tool_scope: ['read_only'],
      adversarial_profile: REQUIRED_ADVERSARIAL_PROFILES.slice(),
      failure_mode: ['timeout']
    }
  };
}
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-worker-registry-'));
  let tick = 0;
  const store = createWorkerRegistry(path.join(dir, 'registry.json'), { now: () => '2026-10-21T00:00:0' + tick++ + 'Z' });
  return { dir, store };
}

test('registration is idempotent and always starts as an unqualified candidate', () => {
  const { dir, store } = setup();
  try {
    const blueprint = fixtureBlueprint();
    const first = store.register(blueprint, 'deterministic_template_fallback');
    const second = store.register(blueprint, 'local_model');
    assert.equal(first.ok, true);
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(first.worker.state, 'candidate');
    assert.equal(first.worker.qualification.state, 'not_qualified');
    assert.equal(first.worker.source, 'deterministic_template_fallback');
    assert.equal(store.list().count, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('smoke results update evidence but never qualify or promote a worker', () => {
  const { dir, store } = setup();
  try {
    const blueprint = fixtureBlueprint();
    const hash = createBlueprint(blueprint).blueprint_hash;
    store.register(blueprint, 'manual');
    const result = store.recordSmoke(hash, {
      mode: 'adversarial_smoke_only',
      state: 'smoke_pass',
      qualified: false,
      pass_count: 10,
      total_cases: 10,
      critical_failures: 0,
      deterministic_cases: 10
    }, 'worker-forge-eval-smoke.json');
    assert.equal(result.ok, true);
    assert.equal(result.worker.state, 'candidate');
    assert.equal(result.worker.last_smoke.state, 'smoke_pass');
    assert.equal(result.worker.last_smoke.qualified, false);
    assert.equal(result.worker.qualification.state, 'not_qualified');
    assert.deepEqual(fs.readdirSync(dir), ['registry.json'], 'successful replacement must clean temporary and backup files');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('invalid blueprints, fake qualification, and nested artifact references are rejected', () => {
  const { dir, store } = setup();
  try {
    assert.equal(store.register({ id: 'evil', capabilities: ['unbounded_shell'] }).ok, false);
    const blueprint = fixtureBlueprint();
    const hash = createBlueprint(blueprint).blueprint_hash;
    store.register(blueprint);
    assert.equal(store.recordSmoke(hash, { mode: 'adversarial_smoke_only', state: 'smoke_pass', qualified: true }, 'x.json').error, 'smoke_result_not_accepted');
    assert.equal(store.recordSmoke(hash, { mode: 'adversarial_smoke_only', state: 'smoke_pass', qualified: false }, 'folder/artifact.json').error, 'invalid_artifact_reference');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('corrupt registry fails closed instead of overwriting the evidence file', () => {
  const { dir, store } = setup();
  try {
    const file = path.join(dir, 'registry.json');
    fs.writeFileSync(file, '{"schema_version":99,"workers":[]}', 'utf8');
    assert.throws(() => store.list(), /worker_registry_corrupt_or_unsupported/);
    assert.throws(() => store.register(fixtureBlueprint()), /worker_registry_corrupt_or_unsupported/);
    assert.match(fs.readFileSync(file, 'utf8'), /schema_version/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});