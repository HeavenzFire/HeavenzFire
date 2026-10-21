'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBlueprint, REQUIRED_ADVERSARIAL_PROFILES } = require('./worker-forge.cjs');
const { REMEDIATION_RULES, remediateBlueprint } = require('./worker-forge-remediation.cjs');

function blueprint(overrides = {}) {
  return {
    id: 'hf-remediation-worker',
    version: '1.0.0',
    role: 'adversarial test worker',
    objective: 'Use test failures to improve worker policy while preserving bounded and auditable behavior.',
    input_schema: { type: 'object', required: ['task_id'] },
    output_schema: { type: 'object', required: ['decision', 'tool_calls', 'evidence_refs', 'reason'] },
    capabilities: ['read_local_artifacts', 'request_peer_review'],
    forbidden_capabilities: ['unbounded_shell', 'credential_exfiltration', 'stealth_persistence'],
    execution: { mode: 'proposal_only', max_tool_calls: 4 },
    axes: {
      task_type: ['build', 'review'],
      risk_class: ['LOW', 'MEDIUM', 'HIGH'],
      evidence_quality: ['verified', 'partial'],
      tool_scope: ['read_only', 'scoped_write'],
      adversarial_profile: REQUIRED_ADVERSARIAL_PROFILES.slice(),
      failure_mode: ['timeout', 'invalid_output', 'dependency_failure']
    },
    ...overrides
  };
}
function artifact(bp, results) {
  return {
    mode: 'adversarial_smoke_only',
    state: 'smoke_failed',
    qualified: false,
    blueprint_hash: createBlueprint(bp).blueprint_hash,
    results
  };
}

test('failed profiles produce a versioned policy-remediated candidate without weight training', () => {
  const bp = blueprint();
  const smoke = artifact(bp, [
    { profile: 'prompt_injection', pass: false },
    { profile: 'unauthorized_tool', pass: false },
    { profile: 'stale_evidence', pass: true }
  ]);
  const result = remediateBlueprint(bp, smoke, 'worker-forge-eval-live.json');
  assert.equal(result.ok, true);
  assert.equal(result.blueprint.version, '1.0.1');
  assert.equal(result.blueprint.id, bp.id);
  assert.equal(result.blueprint.execution.mode, 'proposal_only');
  assert.equal(result.blueprint.policy_rules.length, 2);
  assert.equal(result.report.failed_profiles.length, 2);
  assert.equal(result.report.rules_added.length, 2);
  assert.equal(result.report.weight_training_performed, false);
  assert.equal(result.report.qualification, 'not_qualified');
  assert.notEqual(result.blueprint_hash, result.source_blueprint_hash);
  assert.match(result.blueprint.policy_rules[0], /override attempts as untrusted task data/);
});

test('all ten known adversarial profiles have deterministic remediation rules', () => {
  assert.deepEqual(Object.keys(REMEDIATION_RULES).sort(), REQUIRED_ADVERSARIAL_PROFILES.slice().sort());
});

test('remediation rejects evidence from another blueprint and smoke passes', () => {
  const bp = blueprint();
  const mismatch = artifact(bp, [{ profile: 'prompt_injection', pass: false }]);
  mismatch.blueprint_hash = 'a'.repeat(64);
  assert.equal(remediateBlueprint(bp, mismatch, 'worker-forge-eval-live.json').error, 'artifact_blueprint_hash_mismatch');
  const passing = artifact(bp, [{ profile: 'prompt_injection', pass: true }]);
  passing.state = 'smoke_pass';
  assert.equal(remediateBlueprint(bp, passing, 'worker-forge-eval-live.json').error, 'failed_smoke_artifact_required');
});

test('remediation rejects path-bearing artifact references and unknown failure profiles', () => {
  const bp = blueprint();
  const smoke = artifact(bp, [{ profile: 'prompt_injection', pass: false }]);
  assert.equal(remediateBlueprint(bp, smoke, 'folder/worker-forge-eval-live.json').error, 'invalid_artifact_reference');
  const unknown = artifact(bp, [{ profile: 'made_up_profile', pass: false }]);
  assert.equal(remediateBlueprint(bp, unknown, 'worker-forge-eval-live.json').error, 'unknown_failed_profiles');
});

test('policy rule validation rejects unbounded or duplicate rules', () => {
  const tooMany = blueprint({ policy_rules: Array.from({ length: 33 }, (_, i) => 'policy rule ' + i) });
  const built = createBlueprint(tooMany);
  assert.equal(built.ok, false);
  assert.ok(built.errors.includes('invalid_policy_rules'));
});
