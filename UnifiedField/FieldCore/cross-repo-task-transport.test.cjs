'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createTaskInboxServer } = require('./task-inbox-server.cjs');

const adapterPath = process.env.HF_HUB_ADAPTER_PATH;
const governedLifecyclePath = process.env.HF_GOVERNED_LIFECYCLE_PATH;
if (!adapterPath || !governedLifecyclePath) {
  test('cross-repository adapter and governed lifecycle paths are configured', { skip: 'CI must check out UnifiedCodebase and set both adapter/lifecycle paths' }, () => {});
} else {
  test('UnifiedCodebase proposal reaches real inbox, deduplicates, rejects conflicts, and survives restart', async t => {
    const { submitProposal } = await import(pathToFileURL(path.resolve(adapterPath)).href);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heavenzfire-cross-repo-'));
    const inboxPath = path.join(dir, 'inbox.jsonl');
    let server;

    async function startServer() {
      server = createTaskInboxServer({ inboxPath, port: 0 });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      return 'http://127.0.0.1:' + server.address().port + '/api/tasks';
    }
    async function stopServer() {
      if (!server?.listening) return;
      server.closeAllConnections?.();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      server = null;
    }

    t.after(async () => {
      await stopServer();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    const endpoint = await startServer();
    const task = {
      taskId: 'cross-repo-smoke-1',
      title: 'Verify federated proposal delivery',
      requestedBy: 'integration-test',
      status: 'queued',
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
      metadata: { project: 'continuous-rd-pipeline', cycle: 99 }
    };

    const first = await submitProposal(task, { endpoint });
    const second = await submitProposal(task, { endpoint });
    assert.equal(first.ok, true);
    assert.equal(first.duplicate, false);
    assert.equal(second.ok, true);
    assert.equal(second.duplicate, true);

    await assert.rejects(
      submitProposal({ ...task, title: 'Conflicting payload with same ID' }, { endpoint }),
      /HTTP 409.*task_id_conflict/
    );

    assert.equal(fs.readFileSync(inboxPath, 'utf8').trim().split(/\r?\n/).length, 1);
    await stopServer();

    const restartedEndpoint = await startServer();
    const response = await fetch(restartedEndpoint.replace('/api/tasks', '/api/tasks/' + encodeURIComponent(task.taskId)));
    const detail = await response.json();
    assert.equal(response.status, 200);
    assert.equal(detail.taskRecord.taskId, task.taskId);
    assert.equal(detail.taskRecord.status, 'proposed');
    assert.equal(detail.taskRecord.approvalState, 'pending');
    assert.equal(detail.taskRecord.goal, task.title);

    // The proposal is data, not authorization: a host using the governed lifecycle
    // must refuse to enter running until a separate explicit approval is recorded.
    const { createGovernedTaskLifecycle } = await import(pathToFileURL(path.resolve(governedLifecyclePath)).href);
    const governed = createGovernedTaskLifecycle({
      taskFilePath: path.join(dir, 'governed-tasks.jsonl'),
      approvalFilePath: path.join(dir, 'governed-approvals.jsonl')
    });
    governed.create({
      taskId: detail.taskRecord.taskId,
      title: detail.taskRecord.goal,
      requestedBy: detail.taskRecord.requestedBy || 'integration-test',
      metadata: { inboxStatus: detail.taskRecord.status, inboxApprovalState: detail.taskRecord.approvalState }
    });
    assert.throws(
      () => governed.transition(task.taskId, 'running', { actor: 'integration-test', reason: 'must not bypass approval' }),
      /Explicit human approval required/
    );
    assert.equal(governed.get(task.taskId).status, 'queued');
    assert.equal(governed.approvalAudit().length, 0);

    governed.approve(task.taskId, { actor: 'human-reviewer', reason: 'separate explicit review' });
    assert.equal(governed.isApproved(task.taskId), true);
    assert.equal(governed.get(task.taskId).status, 'queued');
    assert.equal(governed.approvalAudit().length, 1);
  });
}
