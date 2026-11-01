'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createTaskRecord, transitionTask } = require('../FieldCore/shared-task-contract.cjs');
const { createOrlojAdapter, normalizeBaseUrl, UPSTREAM_REVISION } = require('./orloj-adapter.cjs');

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try { await run('http://127.0.0.1:' + address.port); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function approvedRecord() {
  const proposed = createTaskRecord({
    taskId: 'task-orloj-001',
    source: 'unified-field',
    goal: 'Run the approved bounded research workflow'
  });
  return transitionTask(proposed, 'approved', {
    approvalState: 'approved',
    actor: 'human-operator',
    evidenceItem: { kind: 'approval', summary: 'Explicit operator approval recorded' }
  });
}

test('restricts Orloj API origins to loopback HTTP', () => {
  assert.equal(normalizeBaseUrl('http://127.0.0.1:8080/'), 'http://127.0.0.1:8080');
  assert.throws(() => normalizeBaseUrl('https://127.0.0.1:8080'), /loopback_origin/);
  assert.throws(() => normalizeBaseUrl('http://orloj.example:8080'), /loopback_origin/);
  assert.throws(() => normalizeBaseUrl('http://127.0.0.1:8080/path'), /loopback_origin/);
  assert.throws(() => normalizeBaseUrl('http://user:pass@127.0.0.1:8080'), /loopback_origin/);
});

test('reads Orloj health and capabilities without exposing bearer token', async () => {
  await withServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-token');
    res.setHeader('content-type', 'application/json');
    if (req.url === '/healthz') return res.end(JSON.stringify({ status: 'ok' }));
    if (req.url === '/v1/capabilities') {
      return res.end(JSON.stringify({
        generated_at: '2026-10-31T00:00:00Z',
        capabilities: [{ id: 'core.api.crud', enabled: true, source: 'core' }]
      }));
    }
    res.statusCode = 404;
    res.end('{}');
  }, async baseUrl => {
    const adapter = createOrlojAdapter({ baseUrl, token: 'test-token' });
    const result = await adapter.checkHealth();
    assert.equal(result.ok, true);
    assert.equal(result.capabilityCount, 1);
    assert.equal(result.capabilities[0].id, 'core.api.crud');
    assert.equal(JSON.stringify(result).includes('test-token'), false);
    assert.equal(adapter.upstreamRevision, UPSTREAM_REVISION);
  });
});

test('refuses to dispatch proposed or unsubstantiated approved tasks', async () => {
  let writes = 0;
  await withServer((req, res) => {
    if (req.method === 'POST') writes++;
    res.statusCode = 500;
    res.end('{}');
  }, async baseUrl => {
    const adapter = createOrlojAdapter({ baseUrl, systemName: 'heavenzfire-system' });
    const proposed = createTaskRecord({ source: 'test', goal: 'must remain pending' });
    await assert.rejects(adapter.submitApprovedTask(proposed), /explicit_heavenzfire_task_approval_required/);
    const forged = { ...approvedRecord(), evidence: [] };
    await assert.rejects(adapter.submitApprovedTask(forged), /auditable_approval_evidence_required/);
    assert.equal(writes, 0);
  });
});

test('dispatches an explicitly approved task as an Orloj Task manifest', async () => {
  let received;
  await withServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/v1/tasks') {
      res.statusCode = 404;
      return res.end('{}');
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    res.statusCode = 201;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      apiVersion: 'orloj.dev/v1',
      kind: 'Task',
      metadata: received.metadata,
      spec: received.spec,
      status: { phase: 'Pending' }
    }));
  }, async baseUrl => {
    const adapter = createOrlojAdapter({ baseUrl, systemName: 'heavenzfire-system' });
    const result = await adapter.submitApprovedTask(approvedRecord());
    assert.equal(result.created, true);
    assert.equal(result.providerPhase, 'Pending');
    assert.equal(result.executionMayBegin, true);
    assert.equal(received.kind, 'Task');
    assert.equal(received.spec.system, 'heavenzfire-system');
    assert.equal(received.spec.input.heavenzfire_task_id, 'task-orloj-001');
    assert.equal(received.metadata.annotations['heavenzfire.dev/upstream-revision'], UPSTREAM_REVISION);
  });
});

test('reads task status from Orloj without mutating provider state', async () => {
  await withServer((req, res) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/v1/tasks/hf-task-orloj-001');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      apiVersion: 'orloj.dev/v1',
      kind: 'Task',
      metadata: { name: 'hf-task-orloj-001' },
      status: { phase: 'Succeeded', attempts: 1, assignedWorker: 'worker-a' }
    }));
  }, async baseUrl => {
    const adapter = createOrlojAdapter({ baseUrl });
    const result = await adapter.getTaskStatus('hf-task-orloj-001');
    assert.deepEqual(result, {
      providerTaskName: 'hf-task-orloj-001',
      phase: 'Succeeded',
      attempts: 1,
      assignedWorker: 'worker-a',
      completedAt: null,
      lastError: null
    });
  });
});

test('maps provider errors to bounded status-only failures', async () => {
  await withServer((req, res) => {
    res.statusCode = 503;
    res.end('sensitive upstream body must not be copied into errors');
  }, async baseUrl => {
    const adapter = createOrlojAdapter({ baseUrl });
    await assert.rejects(adapter.checkHealth(), /^Error: orloj_http_503$/);
  });
});
