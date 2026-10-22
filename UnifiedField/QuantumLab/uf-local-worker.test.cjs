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
    const readDenied = await fetch(base + '/api/tasks');
    assert.equal(readDenied.status, 401);
    const readAllowed = await fetch(base + '/api/tasks', { headers: { authorization: 'Bearer test-token' } });
    assert.equal((await readAllowed.json()).tasks.length, 1);
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

test('journal survives worker restart and preserves idempotency', async () => {
  const f = fixture();
  const first = createWorkerServer({ journalPath: f.journalPath, token: 'restart-token' });
  try {
    const a = await first.listen(0);
    const base = 'http://127.0.0.1:' + a.port;
    const queued = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { authorization: 'Bearer restart-token', 'content-type': 'application/json' },
      body: JSON.stringify({ task })
    });
    assert.equal(queued.status, 201);
  } finally {
    await first.close();
  }

  const second = createWorkerServer({ journalPath: f.journalPath, token: 'restart-token' });
  try {
    const a = await second.listen(0);
    const base = 'http://127.0.0.1:' + a.port;
    const read = await fetch(base + '/api/tasks', { headers: { authorization: 'Bearer restart-token' } });
    const data = await read.json();
    assert.equal(read.status, 200);
    assert.equal(data.tasks.length, 1);
    assert.equal(data.tasks[0].task_id, task.task_id);
    assert.equal(data.tasks[0].status, 'QUEUED');

    const duplicate = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { authorization: 'Bearer restart-token', 'content-type': 'application/json' },
      body: JSON.stringify({ task })
    });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).duplicate, true);
    const after = await (await fetch(base + '/api/tasks', { headers: { authorization: 'Bearer restart-token' } })).json();
    assert.equal(after.tasks.length, 1);
  } finally {
    await second.close();
    f.cleanup();
  }
});

test('corrupt journal fails closed: health flags it and enqueue is rejected', async () => {
  const f = fixture();
  fs.writeFileSync(f.journalPath, '{broken json\\n', 'utf8');
  const worker = createWorkerServer({ journalPath: f.journalPath, token: 'corrupt-token' });
  try {
    const a = await worker.listen(0);
    const base = 'http://127.0.0.1:' + a.port;
    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.writable, false);
    assert.equal(health.journal.corruptLines, 1);

    const rejected = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { authorization: 'Bearer corrupt-token', 'content-type': 'application/json' },
      body: JSON.stringify({ task: { ...task, task_id: 't-corrupt', idempotency_key: 'idem-corrupt' } })
    });
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).error, /writes are blocked/);
    assert.equal(fs.readFileSync(f.journalPath, 'utf8'), '{broken json\\n');
  } finally {
    await worker.close();
    f.cleanup();
  }
});

test('HTTP execution rejects write and arbitrary Node test actions even when caller claims approval', async () => {
  await withWorker({ token: 'execute-token' }, async base => {
    const request = action => fetch(base + '/api/execute', {
      method: 'POST',
      headers: { authorization: 'Bearer execute-token', 'content-type': 'application/json' },
      body: JSON.stringify({ request_id: 'request-1234', approved: true, action, input: { path: 'created.test.cjs', content: 'process.exit(99)' } })
    });
    const write = await request('workspace.write_file');
    assert.equal(write.status, 403);
    assert.equal((await write.json()).error, 'execution_action_not_enabled_over_http');
    const nodeTest = await request('node.test');
    assert.equal(nodeTest.status, 403);
    assert.equal((await nodeTest.json()).error, 'execution_action_not_enabled_over_http');
  });
});
