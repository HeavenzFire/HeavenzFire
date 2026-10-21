'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTaskRecord, transitionTask } = require('./shared-task-contract.cjs');
const { createTaskInboxServer } = require('./task-inbox-server.cjs');

async function withInbox(t, callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heavenzfire-task-inbox-'));
  const inboxPath = path.join(dir, 'inbox.jsonl');
  const server = createTaskInboxServer({ inboxPath, port: 0 });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const address = server.address();
  return callback({ baseUrl: 'http://127.0.0.1:' + address.port, inboxPath });
}

function proposal(taskId = 'proposal-1', goal = 'Test proposal intake') {
  return createTaskRecord({ taskId, source: 'continuous-rd-pipeline', goal, metadata: { cycle: 1 } });
}

async function post(baseUrl, taskRecord) {
  return fetch(baseUrl + '/api/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskRecord })
  });
}

test('loopback inbox accepts proposed/pending tasks and persists task evidence', async t => {
  await withInbox(t, async ({ baseUrl, inboxPath }) => {
    const task = proposal();
    const response = await post(baseUrl, task);
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.ok, true);
    assert.equal(body.taskId, task.taskId);
    const lookup = await fetch(baseUrl + '/api/tasks/' + encodeURIComponent(task.taskId));
    const detail = await lookup.json();
    assert.equal(lookup.status, 200);
    assert.equal(detail.taskRecord.approvalState, 'pending');
    assert.equal(detail.taskRecord.status, 'proposed');
    assert.equal(fs.readFileSync(inboxPath, 'utf8').trim().split(/\r?\n/).length, 1);
  });
});

test('duplicate delivery is idempotent and conflicting task ID is rejected', async t => {
  await withInbox(t, async ({ baseUrl, inboxPath }) => {
    const task = proposal();
    assert.equal((await post(baseUrl, task)).status, 201);
    const duplicate = await post(baseUrl, task);
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).duplicate, true);
    const conflict = await post(baseUrl, proposal(task.taskId, 'Different goal with same ID'));
    assert.equal(conflict.status, 409);
    assert.equal(fs.readFileSync(inboxPath, 'utf8').trim().split(/\r?\n/).length, 1);
  });
});

test('inbox rejects approved execution states and malformed JSON records', async t => {
  await withInbox(t, async ({ baseUrl }) => {
    const approved = transitionTask(proposal('approved-1'), 'approved', { approvalState: 'approved' });
    const denied = await post(baseUrl, approved);
    assert.equal(denied.status, 422);
    const malformed = await fetch(baseUrl + '/api/tasks', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{'
    });
    assert.equal(malformed.status, 400);
    const wrongType = await fetch(baseUrl + '/api/tasks', {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}'
    });
    assert.equal(wrongType.status, 415);
  });
});

test('task inbox reports health and returns 404 for unknown task IDs', async t => {
  await withInbox(t, async ({ baseUrl }) => {
    const health = await (await fetch(baseUrl + '/health')).json();
    assert.equal(health.ok, true);
    assert.equal(health.host, '127.0.0.1');
    assert.equal(health.storedTaskCount, 0);
    assert.equal((await fetch(baseUrl + '/api/tasks/missing')).status, 404);
  });
});
