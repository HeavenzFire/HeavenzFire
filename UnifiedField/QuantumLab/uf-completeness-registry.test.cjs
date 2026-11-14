'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRegistry } = require('./uf-completeness-registry.cjs');

function capability(overrides = {}) {
  return {
    id: 'example.capability',
    name: 'Example capability',
    layer: 'control-plane',
    status: 'implemented_unverified',
    owner: 'UnifiedField',
    implementation: 'example.cjs',
    substrates: ['node'],
    triggers: ['manual-cli'],
    integrations: ['task-contract'],
    permissions: ['read-only'],
    evidence: { testCommand: null, testResult: null, revision: null, verifiedAt: null },
    acceptance: ['deterministic-test'],
    ...overrides
  };
}

test('accepts a structurally complete capability without overstating verification', () => {
  const result = validateRegistry({ schemaVersion: 1, capabilities: [capability()] });
  assert.equal(result.ok, true);
  assert.equal(result.summary.incomplete, 1);
  assert.equal(result.summary.verified, 0);
});

test('rejects non-object registries and empty capability lists', () => {
  assert.equal(validateRegistry(null).ok, false);
  const result = validateRegistry({ schemaVersion: 1, capabilities: [] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('capabilities_must_not_be_empty'));
});

test('rejects duplicate capability identifiers', () => {
  const item = capability();
  const result = validateRegistry({ schemaVersion: 1, capabilities: [item, { ...item }] });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('duplicate_id')));
});

test('rejects unknown lifecycle states', () => {
  const result = validateRegistry({
    schemaVersion: 1,
    capabilities: [capability({ status: 'operational_everywhere' })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('invalid_status')));
});

test('rejects empty or wrongly typed required strings and arrays', () => {
  const result = validateRegistry({
    schemaVersion: 1,
    capabilities: [capability({
      name: ' ',
      owner: 42,
      substrates: ['node', ' '],
      triggers: [],
      integrations: ['task', null]
    })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('invalid_name')));
  assert.ok(result.errors.some(error => error.includes('invalid_owner')));
  assert.ok(result.errors.some(error => error.includes('substrates_must_be_nonempty_string_array')));
  assert.ok(result.errors.some(error => error.includes('triggers_must_be_nonempty_string_array')));
  assert.ok(result.errors.some(error => error.includes('integrations_must_be_nonempty_string_array')));
});

test('does not allow verified without reproducible passing evidence', () => {
  const result = validateRegistry({
    schemaVersion: 1,
    capabilities: [capability({ status: 'verified' })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('verified_requires_reproducible_passing_evidence')));
});

test('rejects verified evidence with failed result, invalid revision, or invalid timestamp', () => {
  const result = validateRegistry({
    schemaVersion: 1,
    capabilities: [capability({
      status: 'verified',
      evidence: {
        testCommand: 'node --test example.test.cjs',
        testResult: 'failed',
        revision: 'not-a-sha',
        verifiedAt: 'yesterday'
      }
    })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('verified_requires_reproducible_passing_evidence')));
});

test('accepts verified only with command, commit, UTC time, workflow job, and artifact attestation', () => {
  const result = validateRegistry({
    schemaVersion: 1,
    capabilities: [capability({
      status: 'verified',
      evidence: {
        testCommand: 'node --test example.test.cjs',
        testResult: 'pass',
        revision: '0123456789abcdef0123456789abcdef01234567',
        verifiedAt: '2024-02-29T23:59:59Z',
        repository: 'HeavenzFire/HeavenzFire',
        workflowRunId: 123,
        workflowRunAttempt: 1,
        workflowId: 456,
        workflowName: 'Unified Field Completeness Registry',
        workflowPath: '.github/workflows/unified-field-completeness.yml',
        workflowJob: 'completeness',
        requiredSteps: ['Validate capability registry', 'Test registry enforcement'],
        artifactName: 'uf-completeness-tests',
        artifactDigest: 'sha256:' + 'a'.repeat(64)
      }
    })]
  });
  assert.equal(result.ok, true);
  assert.equal(result.summary.verified, 1);
});


test('rejects verified claims without GitHub Actions run, job, and artifact binding', () => {
  const result = validateRegistry({
    schemaVersion: 1,
    capabilities: [capability({
      status: 'verified',
      evidence: {
        testCommand: 'node --test example.test.cjs',
        testResult: 'pass',
        revision: 'a'.repeat(40),
        verifiedAt: '2026-11-09T00:00:00Z'
      }
    })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('capabilities[0]:verified_requires_github_actions_run_job_and_artifact_attestation'));
});

test('rejects empty trigger, integration, substrate, permission, or acceptance lists', () => {
  const result = validateRegistry({
    schemaVersion: 1,
    capabilities: [capability({ triggers: [], integrations: [], substrates: [], permissions: [], acceptance: [] })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 5);
});

test('rejects impossible UTC calendar dates and out-of-range clock components', () => {
  const invalidTimestamps = [
    '2026-02-30T00:00:00Z',
    '2025-02-29T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-01-00T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T23:60:00Z',
    '2026-01-01T23:59:60Z',
    '2026-01-01T00:00:00+00:00'
  ];

  for (const verifiedAt of invalidTimestamps) {
    const result = validateRegistry({
      schemaVersion: 1,
      capabilities: [capability({
        status: 'verified',
        evidence: {
          testCommand: 'node --test example.test.cjs',
          testResult: 'pass',
          revision: 'a'.repeat(40),
          verifiedAt
        }
      })]
    });
    assert.equal(result.ok, false, verifiedAt);
    assert.ok(result.errors.includes('capabilities[0]:verified_requires_reproducible_passing_evidence'));
  }
});

test('requires a full 40-character commit SHA for verified evidence', () => {
  for (const revision of ['deadbee', 'a'.repeat(39), 'a'.repeat(41)]) {
    const result = validateRegistry({
      schemaVersion: 1,
      capabilities: [capability({
        status: 'verified',
        evidence: {
          testCommand: 'node --test example.test.cjs',
          testResult: 'pass',
          revision,
          verifiedAt: '2026-11-04T00:00:00Z'
        }
      })]
    });
    assert.equal(result.ok, false, revision);
  }
});

