'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTaskRecord } = require('./shared-task-contract.cjs');
const { createTaskInboxServer } = require('./task-inbox-server.cjs');

const adapterPath = process.env.HF_HUB_ADAPTER_PATH;
if (!adapterPath) {
  test('cross-repository adapter path is configured', { skip: 'Set HF_HUB_ADAPTER_PATH to the checked-out OpenSourceAIHub adapter' }, () => {});
} else {
  const { submitProposal } = require(path.resolve(adapterPath));

  test('OpenSourceAIHub proposal reaches the Unified Field inbox with stable ID and pending approval', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heavenzfire-cross-repo-'));
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

    const endpoint = 'http://127.0.0.1:' + server.address().port + '/api/tasks';
    const task = createTaskRecord({
      taskId: 'cross-repo-smoke-1',
      source: 'continuous-rd-pipeline',
      goal: 'Verify federated proposal delivery',
      metadata: { cycle: 99 }
    });
    const first = await submitProposal(task, { endpoint });
    const second = await submitProposal(task, { endpoint });
    assert.equal(first.ok, true);
    assert.equal(first.duplicate, false);
    assert.equal(second.ok, true);
    assert.equal(second.duplicate, true);

    const response = await fetch(endpoint.replace('/api/tasks', '/api/tasks/' + encodeURIComponent(task.taskId)));
    const detail = await response.json();
    assert.equal(response.status, 200);
    assert.equal(detail.taskRecord.taskId, task.taskId);
    assert.equal(detail.taskRecord.status, 'proposed');
    assert.equal(detail.taskRecord.approvalState, 'pending');
    assert.equal(fs.readFileSync(inboxPath, 'utf8').trim().split(/\r?\n/).length, 1);
  });
}
