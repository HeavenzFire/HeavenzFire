'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, DECISION, REQUIRED_GATES } = require('./uf-tcp-policy.cjs');

const digest = 'a'.repeat(64);
function valid(overrides = {}) {
  const gates = Object.fromEntries(REQUIRED_GATES.map(k => [k, true]));
  return {
    proposer_id: 'assistant-proposer',
    mandatory_invariants: [{ id: 'no-secret-leak', status: 'pass' }],
    counterexamples: [],
    gates,
    evidence_sha256: digest,
    verifiers: [
      { id: 'reviewer-a', identity: 'reviewer-process-a', execution_id: 'exec-a', isolation_id: 'sandbox-a', independent: true, evidence_sha256: digest, decision: 1, rationale: 'Reviewed diff and test evidence.' },
      { id: 'reviewer-b', identity: 'reviewer-process-b', execution_id: 'exec-b', isolation_id: 'sandbox-b', independent: true, evidence_sha256: digest, decision: 1, rationale: 'Repeated checks independently.' }
    ],
    ...overrides
  };
}

test('accepts only when every gate and two structurally distinct verifiers pass', () => {
  assert.equal(evaluate(valid()).decision, DECISION.ACCEPT);
  assert.equal(evaluate(valid()).code, 'ALL_GATES_PASSED');
});

test('mandatory invariant failure rejects regardless of verifier votes', () => {
  const input = valid({ mandatory_invariants: [{ id: 'no-secret-leak', status: 'fail' }] });
  assert.equal(evaluate(input).decision, DECISION.REJECT);
  assert.equal(evaluate(input).code, 'MANDATORY_INVARIANT_FAILED');
});

test('unknown or absent mandatory invariants abstain', () => {
  assert.equal(evaluate(valid({ mandatory_invariants: [{ id: 'x', status: 'unknown' }] })).decision, 0);
  assert.equal(evaluate(valid({ mandatory_invariants: [] })).decision, 0);
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

test('a reproduced counterexample rejects even when all verifiers accept', () => {
  const outcome = evaluate(valid({ counterexamples: [{ id: 'counterexample-1', status: 'reproduced' }] }));
  assert.equal(outcome.decision, -1);
  assert.equal(outcome.code, 'REPRODUCIBLE_COUNTEREXAMPLE');
});

test('unresolved or malformed counterexample evidence abstains', () => {
  assert.equal(evaluate(valid({ counterexamples: [{ id: 'ce-1', status: 'unresolved' }] })).decision, 0);
  assert.equal(evaluate(valid({ counterexamples: [{ id: 'ce-1', status: 'unknown' }] })).decision, 0);
});

test('proposer cannot verify own work', () => {
  const v = valid().verifiers;
  v[0] = { ...v[0], identity: 'assistant-proposer' };
  assert.equal(evaluate(valid({ verifiers: v })).decision, 0);
});

test('verifier execution and isolation contexts must be distinct', () => {
  const v = valid().verifiers;
  v[1] = { ...v[1], execution_id: v[0].execution_id };
  assert.equal(evaluate(valid({ verifiers: v })).decision, 0);
  v[1] = { ...v[1], execution_id: 'exec-b', isolation_id: v[0].isolation_id };
  assert.equal(evaluate(valid({ verifiers: v })).decision, 0);
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
