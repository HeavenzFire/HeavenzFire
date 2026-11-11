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
  const server = createTaskInboxServer({ inboxPath, port: 0, readToken: 'test-inbox-read-token-that-is-at-least-32-chars' });
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

const readHeaders = { authorization: 'Bearer test-inbox-read-token-that-is-at-least-32-chars' };

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
    const lookup = await fetch(baseUrl + '/api/tasks/' + encodeURIComponent(task.taskId), { headers: readHeaders });
    const detail = await lookup.json();
    assert.equal(lookup.status, 200);
    assert.equal(detail.taskRecord.approvalState, 'pending');
    assert.equal(detail.taskRecord.status, 'proposed');
    assert.equal(fs.readFileSync(inboxPath, 'utf8').trim().split('\n').length, 1);
  });
});

test('inbox fsyncs the accepted JSONL record before returning success', async t => {
  await withInbox(t, async ({ baseUrl, inboxPath }) => {
    const originalFsync = fs.fsyncSync;
    let fsyncCalls = 0;
    fs.fsyncSync = function(fd) {
      fsyncCalls++;
      return originalFsync.call(fs, fd);
    };
    let response;
    try {
      response = await post(baseUrl, proposal('durable-inbox-1', 'Durably persist before acknowledgement'));
    } finally {
      fs.fsyncSync = originalFsync;
    }
    assert.equal(response.status, 201);
    assert.equal(fsyncCalls, 1);
    assert.equal(fs.readFileSync(inboxPath, 'utf8').trim().split(/\r?\n/).length, 1);
  });
});

test('inbox completes short writes before acknowledging a JSONL record', async t => {
  await withInbox(t, async ({ baseUrl, inboxPath }) => {
    const originalWriteSync = fs.writeSync;
    let writeCalls = 0;
    fs.writeSync = function(fd, buffer, offset, length, position) {
      writeCalls++;
      const chunkLength = writeCalls === 1 ? Math.max(1, Math.floor(length / 2)) : length;
      return originalWriteSync.call(fs, fd, buffer, offset, chunkLength, position);
    };
    let response;
    try {
      response = await post(baseUrl, proposal('short-write-1', 'Complete a partial JSONL write'));
    } finally {
      fs.writeSync = originalWriteSync;
    }
    assert.equal(response.status, 201);
    assert.ok(writeCalls >= 2);
    const lines = fs.readFileSync(inboxPath, 'utf8').trim().split(/\r?\n/);
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).taskRecord.taskId, 'short-write-1');
  });
});

test('inbox rolls back a partial append when a later write fails', async t => {
  await withInbox(t, async ({ baseUrl, inboxPath }) => {
    const existing = proposal('existing-inbox-1', 'Preserve the prior accepted record');
    assert.equal((await post(baseUrl, existing)).status, 201);
    const originalContent = fs.readFileSync(inboxPath, 'utf8');
    const retryable = proposal('partial-failure-1', 'Do not acknowledge a truncated record');
    const originalWriteSync = fs.writeSync;
    let writeCalls = 0;
    fs.writeSync = function(fd, buffer, offset, length, position) {
      writeCalls++;
      if (writeCalls === 1) {
        const partialLength = Math.max(1, Math.floor(length / 2));
        return originalWriteSync.call(fs, fd, buffer, offset, partialLength, position);
      }
      throw new Error('simulated write failure after a short write');
    };
    let failed;
    try {
      failed = await post(baseUrl, retryable);
    } finally {
      fs.writeSync = originalWriteSync;
    }
    assert.equal(failed.status, 500);
    assert.equal(writeCalls, 2);
    assert.equal(fs.readFileSync(inboxPath, 'utf8'), originalContent);
    const listing = await fetch(baseUrl + '/api/tasks', { headers: readHeaders });
    assert.equal(listing.status, 200);
    assert.equal((await listing.json()).total, 1);
    const retried = await post(baseUrl, retryable);
    assert.equal(retried.status, 201);
    const lines = fs.readFileSync(inboxPath, 'utf8').trim().split(/\r?\n/);
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[1]).taskRecord.taskId, 'partial-failure-1');
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

test('task inbox lists newest pending proposals with a bounded limit', async t => {
  await withInbox(t, async ({ baseUrl }) => {
    assert.equal((await post(baseUrl, proposal('list-1', 'First proposal'))).status, 201);
    assert.equal((await post(baseUrl, proposal('list-2', 'Second proposal'))).status, 201);
    const response = await fetch(baseUrl + '/api/tasks?limit=1', { headers: readHeaders });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.total, 2);
    assert.equal(body.returned, 1);
    assert.equal(body.tasks[0].taskId, 'list-2');
    assert.equal(body.tasks[0].status, 'proposed');
    assert.equal(body.tasks[0].approvalState, 'pending');
    const invalid = await fetch(baseUrl + '/api/tasks?limit=101', { headers: readHeaders });
    assert.equal(invalid.status, 400);
  });
});

test('task inbox denies direct task reads without bearer authentication', async t => {
  await withInbox(t, async ({ baseUrl }) => {
    const unauthenticatedList = await fetch(baseUrl + '/api/tasks');
    assert.equal(unauthenticatedList.status, 401);
    assert.equal((await unauthenticatedList.json()).error, 'task_inbox_read_authorization_required');
    const unauthenticatedDetail = await fetch(baseUrl + '/api/tasks/missing');
    assert.equal(unauthenticatedDetail.status, 401);
    const authorizedList = await fetch(baseUrl + '/api/tasks', { headers: readHeaders });
    assert.equal(authorizedList.status, 200);
  });
});

test('task inbox reports health and returns 404 for unknown task IDs', async t => {
  await withInbox(t, async ({ baseUrl }) => {
    const health = await (await fetch(baseUrl + '/health')).json();
    assert.equal(health.ok, true);
    assert.equal(health.host, '127.0.0.1');
    assert.equal(health.storedTaskCount, 0);
    assert.equal(health.readAuthorizationConfigured, true);
    assert.equal((await fetch(baseUrl + '/api/tasks/missing', { headers: readHeaders })).status, 404);
  });
});
