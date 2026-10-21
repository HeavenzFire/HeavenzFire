'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, DECISION, REQUIRED_GATES } = require('./uf-tcp-policy.cjs');

const digest = 'a'.repeat(64);
function valid(overrides = {}) {
  const gates = Object.fromEntries(REQUIRED_GATES.map(k => [k, true]));
  return {
    mandatory_invariants: [{ id: 'no-secret-leak', status: 'pass' }],
    gates,
    evidence_sha256: digest,
    verifiers: [
      { id: 'reviewer-a', independent: true, evidence_sha256: digest, decision: 1, rationale: 'Reviewed diff and test evidence.' },
      { id: 'reviewer-b', independent: true, evidence_sha256: digest, decision: 1, rationale: 'Repeated checks independently.' }
    ],
    ...overrides
  };
}

test('accepts only when every gate and two unique verifiers pass', () => {
  assert.equal(evaluate(valid()).decision, DECISION.ACCEPT);
  assert.equal(evaluate(valid()).code, 'ALL_GATES_PASSED');
});

test('mandatory invariant failure rejects regardless of verifier votes', () => {
  const input = valid({ mandatory_invariants: [{ id: 'no-secret-leak', status: 'fail' }] });
  assert.equal(evaluate(input).decision, DECISION.REJECT);
  assert.equal(evaluate(input).code, 'MANDATORY_INVARIANT_FAILED');
});

test('unknown mandatory invariant abstains', () => {
  assert.equal(evaluate(valid({ mandatory_invariants: [{ id: 'x', status: 'unknown' }] })).decision, 0);
});

test('failed required gate rejects', () => {
  const gates = { ...valid().gates, security_review_pass: false };
  assert.equal(evaluate(valid({ gates })).decision, -1);
});

test('missing required gate abstains', () => {
  const gates = { ...valid().gates };
  delete gates.fresh;
  assert.equal(evaluate(valid({ gates })).decision, 0);
});

test('malformed evidence digest abstains', () => {
  assert.equal(evaluate(valid({ evidence_sha256: 'not-a-hash' })).decision, 0);
});

test('duplicate verifier identities do not count twice', () => {
  const v = valid().verifiers;
  v[1] = { ...v[0], rationale: 'Second entry with same identity.' };
  assert.equal(evaluate(valid({ verifiers: v })).decision, 0);
});

test('verifier disagreement abstains until a discriminating test resolves it', () => {
  const v = valid().verifiers;
  v[1] = { ...v[1], decision: -1 };
  const outcome = evaluate(valid({ verifiers: v }));
  assert.equal(outcome.decision, 0);
  assert.equal(outcome.code, 'VERIFIER_DISAGREEMENT');
});

test('verifier evidence must match the reviewed digest', () => {
  const v = valid().verifiers;
  v[1] = { ...v[1], evidence_sha256: 'b'.repeat(64) };
  assert.equal(evaluate(valid({ verifiers: v })).decision, 0);
});

test('invalid input abstains safely', () => {
  assert.equal(evaluate(null).decision, 0);
});

test('evaluation is deterministic for identical input', () => {
  const input = valid();
  assert.deepEqual(evaluate(input), evaluate(input));
});
