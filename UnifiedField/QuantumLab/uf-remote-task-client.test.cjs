'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRemoteTaskClient, normalizeTrustedBaseUrl } = require('./uf-remote-task-client.cjs');

const host = 'zdh.tailb4ab69.ts.net';
const baseUrl = 'https://' + host + '/';
function ok(payload, status = 200) {
  return { status, json: async () => payload };
}
function fakeRemote() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const parsed = new URL(url);
    calls.push({ url: parsed.href, init });
    if (parsed.pathname === '/api/handshake') {
      const body = JSON.parse(init.body);
      return ok({
        ok: true,
        protocol_version: 1,
        worker_instance_id: '0123456789abcdef0123456789abcdef',
        client_nonce: body.client_nonce,
        mode: 'OFFLINE',
        capabilities: ['task-metadata-journal', 'idempotency'],
        limitations: ['no-network-sync', 'no-automatic-replay'],
        nonce_ttl_ms: 120000
      });
    }
    if (parsed.pathname === '/api/tasks' && init.method === 'GET') {
      return ok({ ok: true, tasks: [] });
    }
    if (parsed.pathname === '/api/tasks' && init.method === 'POST') {
      return ok({ ok: true, accepted: true, status: 'QUEUED', task: JSON.parse(init.body).task });
    }
    return ok({ ok: false }, 404);
  };
  return { calls, fetchImpl };
}

test('remote transport requires HTTPS and an exact hostname allowlist', () => {
  assert.throws(() => normalizeTrustedBaseUrl('http://' + host + '/', [host]), { code: 'https_required' });
  assert.throws(() => normalizeTrustedBaseUrl('https://attacker.example/', [host]), { code: 'host_not_allowlisted' });
  assert.throws(() => normalizeTrustedBaseUrl('https://user:pass@' + host + '/', [host]), { code: 'https_required' });
  assert.throws(() => normalizeTrustedBaseUrl('https://' + host + ':8443/', [host]), { code: 'nonstandard_port_denied' });
  assert.equal(normalizeTrustedBaseUrl(baseUrl, [host]).hostname, host);
});

test('remote task client requires a verified handshake before task API calls', async () => {
  const fake = fakeRemote();
  const client = createRemoteTaskClient({ baseUrl, allowedHosts: [host], token: 'test-token', fetchImpl: fake.fetchImpl });
  await assert.rejects(client.listTasks(), { code: 'handshake_required' });
  assert.equal(fake.calls.length, 0);
});

test('performs authenticated HTTPS handshake, lists tasks, and submits a proposal', async () => {
  const fake = fakeRemote();
  const client = createRemoteTaskClient({ baseUrl, allowedHosts: [host], token: 'test-token', fetchImpl: fake.fetchImpl });
  const session = await client.connect();
  assert.equal(session.worker_instance_id, '0123456789abcdef0123456789abcdef');
  const tasks = await client.listTasks();
  assert.deepEqual(tasks, []);
  const task = { task_id: 'remote-test-1', objective: 'Inspect a proposal', scope: ['github:read'], risk_class: 'LOW', idempotency_key: 'idem-remote-1' };
  const result = await client.submitTask(task);
  assert.equal(result.status, 'QUEUED');
  assert.equal(result.task.task_id, task.task_id);
  assert.equal(fake.calls.length, 3);
  for (const call of fake.calls) {
    assert.equal(new URL(call.url).protocol, 'https:');
    assert.equal(call.init.redirect, 'error');
    assert.equal(call.init.headers.authorization, 'Bearer test-token');
  }
});

test('rejects redirect responses and fails closed on server rejection', async () => {
  const client = createRemoteTaskClient({
    baseUrl, allowedHosts: [host], token: 'test-token',
    fetchImpl: async () => ({ status: 302, json: async () => ({ ok: true }) })
  });
  await assert.rejects(client.connect(), { code: 'remote_handshake_rejected' });
});

test('does not send token to a host that is not allowlisted', () => {
  let calls = 0;
  assert.throws(() => createRemoteTaskClient({
    baseUrl: 'https://attacker.example/', allowedHosts: [host], token: 'secret',
    fetchImpl: async () => { calls++; }
  }), { code: 'host_not_allowlisted' });
  assert.equal(calls, 0);
});

test('timeouts and transport errors are surfaced without pretending connection succeeded', async () => {
  const client = createRemoteTaskClient({
    baseUrl, allowedHosts: [host], token: 'test-token',
    fetchImpl: async () => { const e = new Error('offline'); throw e; }
  });
  await assert.rejects(client.connect(), { code: 'remote_transport_failed' });
});
