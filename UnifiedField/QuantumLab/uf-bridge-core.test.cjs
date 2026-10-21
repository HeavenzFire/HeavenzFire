'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { enqueue, replayDecision, parseJournalLines, MODES, STATUS } = require('./uf-bridge-core.cjs');

const task = (overrides={}) => ({
  task_id:'task-1', idempotency_key:'idem-1', objective:'Review a repository change',
  scope:['github.read'], risk_class:'routine', target_commit_sha:'a'.repeat(40), ...overrides
});
const handshake = { ok:true, nonce:'nonce-123', echoed_nonce:'nonce-123', capabilities:['github.read'] };

test('defines explicit connectivity and task states', () => {
  assert.deepEqual(MODES, ['ONLINE','OFFLINE','DEGRADED','RECONNECTING']);
  assert.ok(STATUS.includes('CONFLICT') && STATUS.includes('BLOCKED'));
});

test('queues task records without requiring connectivity or executing them', () => {
  const r = enqueue([], task());
  assert.equal(r.ok, true);
  assert.equal(r.records[0].task.status, 'QUEUED');
});

test('idempotency key prevents duplicate enqueue', () => {
  const first = enqueue([], task());
  const second = enqueue(first.records, task({task_id:'task-2'}));
  assert.equal(second.duplicate, true);
  assert.equal(second.records.length, 1);
  assert.equal(second.task_id, 'task-1');
});

test('invalid tasks are rejected without mutating prior records', () => {
  const records = [{type:'EXISTING'}];
  const r = enqueue(records, task({scope:'github.read'}));
  assert.equal(r.ok, false);
  assert.equal(r.records.length, 1);
});

test('replay requires an echoed nonce handshake', () => {
  assert.equal(replayDecision(task(), 'a'.repeat(40), {...handshake, echoed_nonce:'wrong'}).code, 'HANDSHAKE_UNVERIFIED');
});

test('replay requires every declared capability', () => {
  assert.equal(replayDecision(task({scope:['github.read','github.write']}), 'a'.repeat(40), handshake).code, 'CAPABILITY_MISSING');
});

test('changed target commit becomes a conflict instead of overwrite', () => {
  assert.deepEqual(replayDecision(task(), 'b'.repeat(40), handshake), {status:'CONFLICT',code:'TARGET_COMMIT_CHANGED'});
});

test('privileged, destructive and exposed tasks remain blocked pending approval', () => {
  for (const risk_class of ['privileged','destructive','external-exposure']) {
    assert.equal(replayDecision(task({risk_class}), 'a'.repeat(40), handshake).code, 'EXPLICIT_APPROVAL_REQUIRED');
  }
});

test('routine task is only marked eligible, never executed', () => {
  assert.deepEqual(replayDecision(task(), 'a'.repeat(40), handshake), {status:'QUEUED',code:'REPLAY_ELIGIBLE'});
});

test('journal parser preserves valid records and reports corrupt lines', () => {
  const parsed = parseJournalLines('{"type":"ENQUEUE"}\nnot-json\n{"type":"ACK"}');
  assert.equal(parsed.records.length, 2);
  assert.deepEqual(parsed.errors, [{line:2,code:'MALFORMED_JOURNAL_LINE'}]);
});
