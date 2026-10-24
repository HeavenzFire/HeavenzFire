'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OfflineTaskJournal, MODES } = require('./uf-bridge-journal.cjs');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-bridge-'));
  return { dir, file: path.join(dir, 'queue.jsonl'), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
function task(overrides = {}) {
  return { task_id: 'task-1', objective: 'Review a repository change', scope: ['github:read'], risk_class: 'LOW', idempotency_key: 'idem-1', target_commit_sha: 'abc123', ...overrides };
}

test('queue survives process-style journal reconstruction', () => {
  const f = fixture();
  try {
    new OfflineTaskJournal(f.file).enqueue(task());
    const restarted = new OfflineTaskJournal(f.file);
    assert.equal(restarted.inspect().tasks[0].status, 'QUEUED');
    assert.equal(restarted.inspect().tasks.length, 1);
  } finally { f.cleanup(); }
});
test('idempotency key prevents duplicate task enqueue', () => {
  const f = fixture();
  try {
    const q = new OfflineTaskJournal(f.file);
    assert.equal(q.enqueue(task()).accepted, true);
    const duplicate = q.enqueue(task({ task_id: 'task-2' }));
    assert.equal(duplicate.duplicate, true);
    assert.equal(q.inspect().tasks.length, 1);
  } finally { f.cleanup(); }
});
test('unsupported task risk classes are rejected before journaling', () => {
  const f = fixture();
  try {
    const q = new OfflineTaskJournal(f.file);
    for (const risk_class of ['UNKNOWN', 'CRITICAL', 'low', ' LOW ']) {
      assert.throws(
        () => q.enqueue(task({ task_id: 'invalid-' + JSON.stringify(risk_class), idempotency_key: 'invalid-' + JSON.stringify(risk_class), risk_class })),
        /risk_class must be one of: LOW, MEDIUM, HIGH/
      );
    }
    assert.throws(() => q.enqueue(task({ risk_class: '' })), /risk_class is required/);
    assert.equal(q.inspect().tasks.length, 0);
    for (const risk_class of ['LOW', 'MEDIUM', 'HIGH']) {
      assert.equal(q.enqueue(task({ task_id: 'valid-' + risk_class, idempotency_key: 'valid-' + risk_class, risk_class })).accepted, true);
    }
    assert.equal(q.inspect().tasks.length, 3);
  } finally { f.cleanup(); }
});

test('target revision drift blocks replay and requests fresh evidence', () => {
  const f = fixture();
  try {
    const q = new OfflineTaskJournal(f.file);
    q.enqueue(task());
    assert.equal(q.evaluateReplay('task-1', 'new456').action, 'CONFLICT');
    assert.equal(q.evaluateReplay('task-1', 'abc123').requiresFreshEvidence, true);
  } finally { f.cleanup(); }
});
test('state transitions require RUNNING before DONE', () => {
  const f = fixture();
  try {
    const q = new OfflineTaskJournal(f.file);
    q.enqueue(task());
    assert.throws(() => q.setState('task-1', 'DONE'), /cannot transition from QUEUED to DONE/);
    q.setState('task-1', 'RUNNING', { attempts: 1 });
    assert.equal(q.setState('task-1', 'DONE').status, 'DONE');
    assert.equal(q.evaluateReplay('task-1', 'abc123').action, 'SKIP_ALREADY_DONE');
  } finally { f.cleanup(); }
});
test('task states cannot move backward or leave terminal states', () => {
  const f = fixture();
  try {
    const q = new OfflineTaskJournal(f.file);
    q.enqueue(task());
    q.setState('task-1', 'RUNNING', { attempts: 1 });
    assert.throws(() => q.setState('task-1', 'QUEUED'), /cannot transition from RUNNING to QUEUED/);
    q.setState('task-1', 'DONE');
    for (const status of ['QUEUED', 'RUNNING', 'BLOCKED', 'CONFLICT', 'FAILED']) {
      assert.throws(
        () => q.setState('task-1', status, { last_error: 'test' }),
        new RegExp('cannot transition from DONE to ' + status)
      );
    }
    assert.equal(q.inspect().tasks[0].status, 'DONE');
  } finally { f.cleanup(); }
});

test('corrupt journal lines are reported instead of silently discarded', () => {
  const f = fixture();
  try {
    const q = new OfflineTaskJournal(f.file);
    q.enqueue(task());
    fs.appendFileSync(f.file, '{not-json}\n');
    assert.equal(q.inspect().corruptLines.length, 1);
    assert.equal(q.inspect().tasks.length, 1);
    assert.throws(() => q.enqueue(task({ task_id: 'task-2', idempotency_key: 'idem-2' })), /writes are blocked/);
    assert.throws(() => q.setState('task-1', 'RUNNING'), /writes are blocked/);
    assert.equal(q.inspect().tasks.length, 1);
  } finally { f.cleanup(); }
});
test('executable payloads are rejected', () => {
  const f = fixture();
  try {
    const q = new OfflineTaskJournal(f.file);
    assert.throws(() => q.enqueue(task({ command: 'whoami' })), /executable payloads/);
  } finally { f.cleanup(); }
});
test('mode vocabulary is explicit and deterministic', () => {
  assert.deepEqual([...MODES].sort(), ['DEGRADED', 'OFFLINE', 'ONLINE', 'RECONNECTING']);
});
