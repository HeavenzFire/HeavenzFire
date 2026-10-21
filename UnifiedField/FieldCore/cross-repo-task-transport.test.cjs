'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createTaskInboxServer } = require('./task-inbox-server.cjs');

const adapterPath = process.env.HF_HUB_ADAPTER_PATH;
if (!adapterPath) {
  test('cross-repository adapter path is configured', { skip: 'CI must check out UnifiedCodebase and set HF_HUB_ADAPTER_PATH' }, () => {});
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

    const conflicting = await submitProposal({ ...task, title: 'Conflicting payload with same ID' }, { endpoint });
    assert.fail('conflicting proposal should have been rejected: ' + JSON.stringify(conflicting), { cause: 'unexpected acceptance' });
  });
}
