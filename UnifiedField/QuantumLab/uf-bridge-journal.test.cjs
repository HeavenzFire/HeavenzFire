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
    assert.throws(() => q.setState('task-1', 'DONE'), /must be RUNNING/);
    q.setState('task-1', 'RUNNING', { attempts: 1 });
    assert.equal(q.setState('task-1', 'DONE').status, 'DONE');
    assert.equal(q.evaluateReplay('task-1', 'abc123').action, 'SKIP_ALREADY_DONE');
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

test('semantically malformed JSON events are reported and do not crash inspection', () => {
  const f = fixture();
  try {
    const q = new OfflineTaskJournal(f.file);
    q.enqueue(task());
    fs.appendFileSync(f.file, JSON.stringify({ event_id: 'bad', type: 'TASK_ENQUEUED', payload: {} }) + '\\n');
    const result = q.inspect();
    assert.equal(result.tasks.length, 1);
    assert.equal(result.corruptLines.length, 1);
  } finally { f.cleanup(); }
});
test('terminal states cannot be reopened or overwritten', () => {
  const f = fixture();
  try {
    const q = new OfflineTaskJournal(f.file);
    q.enqueue(task());
    q.setState('task-1', 'RUNNING', { attempts: 1 });
    q.setState('task-1', 'DONE');
    assert.throws(() => q.setState('task-1', 'RUNNING'), /cannot transition/);
    assert.throws(() => q.setState('task-1', 'FAILED'), /cannot transition/);
  } finally { f.cleanup(); }
});
test('conflict state requires a non-empty explanation', () => {
  const f = fixture();
  try {
    const q = new OfflineTaskJournal(f.file);
    q.enqueue(task());
    assert.throws(() => q.setState('task-1', 'CONFLICT'), /requires an explanatory/);
    assert.equal(q.setState('task-1', 'CONFLICT', { last_error: 'target revision changed' }).status, 'CONFLICT');
  } finally { f.cleanup(); }
});
