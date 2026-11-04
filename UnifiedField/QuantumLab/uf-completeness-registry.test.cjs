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

test('does not allow verified without reproducible passing evidence', () => {
  const result = validateRegistry({
    schemaVersion: 1,
    capabilities: [capability({ status: 'verified' })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('verified_requires_reproducible_evidence')));
});

test('accepts verified only with command, passing result, revision, and timestamp', () => {
  const result = validateRegistry({
    schemaVersion: 1,
    capabilities: [capability({
      status: 'verified',
      evidence: {
        testCommand: 'node --test example.test.cjs',
        testResult: 'pass',
        revision: '0123456789abcdef',
        verifiedAt: '2026-11-04T00:00:00Z'
      }
    })]
  });
  assert.equal(result.ok, true);
  assert.equal(result.summary.verified, 1);
});

test('rejects empty trigger, integration, substrate, permission, or acceptance lists', () => {
  const result = validateRegistry({
    schemaVersion: 1,
    capabilities: [capability({ triggers: [], integrations: [], substrates: [], permissions: [], acceptance: [] })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 5);
});
