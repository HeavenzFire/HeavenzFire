'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createEd25519ApprovalVerifier, signApproval, generateEd25519KeyPair
} = require('./ed25519-approval-broker.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-approval-'));
  const keys = generateEd25519KeyPair();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, keys, verifier: createEd25519ApprovalVerifier({ publicKey: keys.publicKey, stateDir: dir }) };
}
const subject = { taskId: 'task-1', goalHash: 'a'.repeat(64) };
function signed(keys, overrides = {}) {
  return signApproval({
    privateKey: keys.privateKey, action: 'execute_task', subject,
    approvedBy: 'Zachary Hulse', reason: 'Reviewed the exact task and authorized this execution.',
    nonce: '0123456789abcdefghijklmnopqrstuv', ...overrides
  });
}

test('valid Ed25519 approval verifies against exact action and subject', async t => {
  const f = fixture(t);
  const evidence = signed(f.keys);
  const result = await f.verifier({ action: 'execute_task', subject, evidence });
  assert.equal(result.approved, true);
  assert.equal(result.approvedBy, 'Zachary Hulse');
  assert.equal(result.method, 'ed25519-human-signature');
});

test('signature cannot be reused after first successful verification', async t => {
  const f = fixture(t);
  const evidence = signed(f.keys);
  await f.verifier({ action: 'execute_task', subject, evidence });
  await assert.rejects(f.verifier({ action: 'execute_task', subject, evidence }), /replay_rejected/);
});

test('approval is bound to action and exact subject', async t => {
  const f = fixture(t);
  const evidence = signed(f.keys);
  await assert.rejects(f.verifier({ action: 'create_issue', subject, evidence }), /context_invalid/);
  await assert.rejects(f.verifier({ action: 'execute_task', subject: { ...subject, goalHash: 'b'.repeat(64) }, evidence }), /context_invalid/);
});

test('modified payload and forged signature are rejected', async t => {
  const f = fixture(t);
  const evidence = signed(f.keys);
  evidence.payload.reason = 'Changed after signing';
  await assert.rejects(f.verifier({ action: 'execute_task', subject, evidence }), /signature_invalid/);
});

test('expired and excessive-lifetime approvals are rejected', async t => {
  const f = fixture(t);
  const expired = signed(f.keys, { now: Date.now() - 1200000, ttlMs: 60000, nonce: 'expirednonce0123456789012345678901' });
  await assert.rejects(f.verifier({ action: 'execute_task', subject, evidence: expired }), /expired_or_outside/);
  assert.throws(() => signed(f.keys, { ttlMs: 6000000, nonce: 'longttlnonce01234567890123456789012' }), /ttl_invalid/);
});

test('approval marker survives verifier recreation and blocks replay', async t => {
  const f = fixture(t);
  const evidence = signed(f.keys);
  await f.verifier({ action: 'execute_task', subject, evidence });
  const restarted = createEd25519ApprovalVerifier({ publicKey: f.keys.publicKey, stateDir: f.dir });
  await assert.rejects(restarted({ action: 'execute_task', subject, evidence }), /replay_rejected/);
});

test('invalid public keys and envelopes fail closed', async t => {
  const f = fixture(t);
  assert.throws(() => createEd25519ApprovalVerifier({ publicKey: 'not-a-key', stateDir: f.dir }), /public_key/);
  await assert.rejects(f.verifier({ action: 'execute_task', subject, evidence: { payload: {}, signature: 'x' } }));
});
