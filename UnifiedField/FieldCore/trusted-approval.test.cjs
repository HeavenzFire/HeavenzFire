'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { resolveTrustedApproval } = require('./trusted-approval.cjs');

const evidence = { signedApproval: 'opaque-test-proof' };
const subject = { taskId: 'task-1', goalHash: 'a'.repeat(64) };
const verified = {
  approved: true, approvalId: 'approval-1', approvedBy: 'verified-human',
  reason: 'Human reviewed the exact task.', method: 'test-signature-verifier',
  verifiedAt: '2026-11-05T08:00:00.000Z'
};

test('missing trusted verifier fails closed', async () => {
  await assert.rejects(resolveTrustedApproval({ verifier: null, action: 'execute_task', subject, evidence }),
    error => error.statusCode === 503 && /not_configured/.test(error.message));
});

test('missing, malformed, and oversized evidence is rejected before verification', async () => {
  let calls = 0;
  const verifier = async () => { calls++; return verified; };
  await assert.rejects(resolveTrustedApproval({ verifier, action: 'execute_task', subject, evidence: null }), /evidence_required/);
  await assert.rejects(resolveTrustedApproval({ verifier, action: 'execute_task', subject, evidence: [] }), /evidence_required/);
  await assert.rejects(resolveTrustedApproval({ verifier, action: 'execute_task', subject, evidence: { value: 'x'.repeat(17000) } }), /evidence_required/);
  assert.equal(calls, 0);
});

test('canonical approver identity comes from verifier, not request evidence', async () => {
  const supplied = { ...evidence, approvedBy: 'model-claimed-operator', reason: 'self-approved' };
  let received;
  const result = await resolveTrustedApproval({ action: 'execute_task', subject, evidence: supplied,
    verifier: async input => { received = input; return verified; } });
  assert.equal(received.action, 'execute_task');
  assert.deepEqual(received.subject, subject);
  assert.equal(result.approvedBy, 'verified-human');
  assert.equal(result.reason, 'Human reviewed the exact task.');
  assert.equal(result.evidenceSha256, crypto.createHash('sha256').update(JSON.stringify(supplied)).digest('hex'));
  assert.equal(result.subjectSha256, crypto.createHash('sha256').update(JSON.stringify({ action: 'execute_task', subject })).digest('hex'));
});

test('verifier exceptions and invalid results fail closed', async () => {
  await assert.rejects(resolveTrustedApproval({ verifier: async () => { throw new Error('bad signature'); }, action: 'execute_task', subject, evidence }),
    error => error.statusCode === 403 && error.message === 'trusted_approval_evidence_rejected');
  await assert.rejects(resolveTrustedApproval({ verifier: async () => ({ ...verified, approved: false }), action: 'execute_task', subject, evidence }),
    error => error.statusCode === 403 && /invalid_evidence/.test(error.message));
  await assert.rejects(resolveTrustedApproval({ verifier: async () => ({ ...verified, approvedBy: '' }), action: 'execute_task', subject, evidence }),
    error => error.statusCode === 403);
});
