'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorkerServer } = require('./uf-local-worker.cjs');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-worker-'));
  return { dir, journalPath: path.join(dir, 'tasks.jsonl'), cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
async function withWorker(options, fn) {
  const f = fixture();
  const worker = createWorkerServer({ journalPath: f.journalPath, ...options });
  const address = await worker.listen(0);
  const base = 'http://127.0.0.1:' + address.port;
  try { await fn(base); }
  finally { await worker.close(); f.cleanup(); }
}
const task = { task_id: 't1', objective: 'Inspect a proposed change', scope: ['github:read'], risk_class: 'LOW', idempotency_key: 'idem-1' };

test('binds loopback and reports explicit non-execution limitations', async () => {
  await withWorker({ token: 'test-token' }, async base => {
    const r = await fetch(base + '/health');
    const data = await r.json();
    assert.equal(r.status, 200);
    assert.equal(data.bind, '127.0.0.1');
    assert.ok(data.limitations.includes('no-shell-execution'));
    assert.ok(data.limitations.includes('no-network-sync'));
  });
});
test('task list is readable but enqueue requires bearer authentication', async () => {
  await withWorker({ token: 'test-token' }, async base => {
    const denied = await fetch(base + '/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task }) });
    assert.equal(denied.status, 401);
    const accepted = await fetch(base + '/api/tasks', { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: JSON.stringify({ task }) });
    assert.equal(accepted.status, 201);
    const duplicate = await fetch(base + '/api/tasks', { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: JSON.stringify({ task }) });
    assert.equal(duplicate.status, 200);
    assert.equal((await (await fetch(base + '/api/tasks')).json()).tasks.length, 1);
  });
});
test('without configured token, writes are disabled', async () => {
  await withWorker({ token: '' }, async base => {
    const r = await fetch(base + '/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task }) });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, 'write_token_not_configured');
  });
});
test('replay check reports target revision conflicts without executing', async () => {
  await withWorker({ token: 'test-token' }, async base => {
    await fetch(base + '/api/tasks', { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: JSON.stringify({ task: { ...task, target_commit_sha: 'abc123' } }) });
    const r = await fetch(base + '/api/tasks/t1/replay-check', { method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: JSON.stringify({ current_commit_sha: 'new456' }) });
    const data = await r.json();
    assert.equal(data.result.action, 'CONFLICT');
    assert.equal(data.result.reason, 'TARGET_COMMIT_CHANGED');
  });
});
test('unsupported routes and methods are rejected', async () => {
  await withWorker({ token: 'test-token' }, async base => {
    assert.equal((await fetch(base + '/unknown')).status, 404);
    assert.equal((await fetch(base + '/health', { method: 'POST' })).status, 404);
  });
});
