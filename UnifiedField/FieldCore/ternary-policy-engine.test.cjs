'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DECISIONS, SCHEMA, evaluatePolicy } = require('./ternary-policy-engine.cjs');

function request(overrides = {}) {
  return {
    action: 'repo.read',
    taskId: 'task-001',
    policy: { allowActions: ['repo.read', 'repo.write'], denyActions: [], requireApproval: false },
    evidence: { status: 'verified', refs: ['sha256:abc123'] },
    approval: { status: 'not_required' },
    ...overrides
  };
}

test('schema and decision values are stable', () => {
  assert.equal(SCHEMA, 'heavenzfire.ternary-decision.v1');
  assert.deepEqual(DECISIONS, { DENY: -1, ABSTAIN: 0, ALLOW: 1 });
});

test('allow requires an allowlisted action and verified evidence', () => {
  assert.deepEqual(evaluatePolicy(request()), {
    schema: SCHEMA, decision: 1, label: 'allow', action: 'repo.read',
    reasons: ['evidence_verified', 'policy_allowlisted']
  });
});

test('explicit deny wins even when the action is allowlisted', () => {
  const out = evaluatePolicy(request({
    action: 'repo.write',
    policy: { allowActions: ['repo.write'], denyActions: ['repo.write'], requireApproval: false }
  }));
  assert.equal(out.decision, -1);
  assert.deepEqual(out.reasons, ['policy_explicit_deny']);
});

test('unlisted actions are denied by default', () => {
  const out = evaluatePolicy(request({ action: 'repo.delete' }));
  assert.equal(out.decision, -1);
  assert.deepEqual(out.reasons, ['action_not_allowlisted']);
});

test('NOT_RUN evidence abstains and never allows', () => {
  const out = evaluatePolicy(request({ evidence: { status: 'not_run', refs: [] } }));
  assert.equal(out.decision, 0);
  assert.deepEqual(out.reasons, ['evidence_not_run']);
});

test('incomplete or reference-free evidence abstains', () => {
  assert.equal(evaluatePolicy(request({
    evidence: { status: 'incomplete', refs: ['sha256:partial'] }
  })).decision, 0);
  assert.equal(evaluatePolicy(request({
    evidence: { status: 'verified', refs: [] }
  })).decision, 0);
});

test('failed evidence denies', () => {
  const out = evaluatePolicy(request({ evidence: { status: 'failed', refs: ['run:failed'] } }));
  assert.equal(out.decision, -1);
  assert.deepEqual(out.reasons, ['evidence_failed']);
});

test('required approval pending or absent abstains', () => {
  const policy = { allowActions: ['repo.write'], denyActions: [], requireApproval: true };
  assert.equal(evaluatePolicy(request({ action: 'repo.write', policy,
    approval: { status: 'pending' } })).decision, 0);
  assert.equal(evaluatePolicy(request({ action: 'repo.write', policy,
    approval: { status: 'not_required' } })).decision, 0);
});

test('rejected approval denies', () => {
  const out = evaluatePolicy(request({ approval: { status: 'rejected' } }));
  assert.equal(out.decision, -1);
  assert.deepEqual(out.reasons, ['approval_rejected']);
});

test('approval must match both action and task id', () => {
  const policy = { allowActions: ['repo.write'], denyActions: [], requireApproval: true };
  const good = { status: 'approved', action: 'repo.write', taskId: 'task-001' };
  assert.equal(evaluatePolicy(request({ action: 'repo.write', policy, approval: good })).decision, 1);
  assert.equal(evaluatePolicy(request({ action: 'repo.write', policy,
    approval: { ...good, taskId: 'other-task' } })).decision, -1);
  assert.equal(evaluatePolicy(request({ action: 'repo.write', policy,
    approval: { ...good, action: 'repo.delete' } })).decision, -1);
});

test('malformed input and policy fail closed', () => {
  assert.equal(evaluatePolicy(null).decision, -1);
  assert.equal(evaluatePolicy(request({ action: '' })).decision, -1);
  assert.equal(evaluatePolicy(request({ policy: {} })).decision, -1);
});

test('evaluation is deterministic and does not mutate its input', () => {
  const input = request();
  const before = JSON.stringify(input);
  assert.deepEqual(evaluatePolicy(input), evaluatePolicy(input));
  assert.equal(JSON.stringify(input), before);
});
