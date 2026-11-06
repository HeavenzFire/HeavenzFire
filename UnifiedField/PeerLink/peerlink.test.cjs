'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPeerLinkHub } = require('./peerlink-hub.cjs');
const { createPeerLinkAgent, validateBaseUrl } = require('./peerlink-agent.cjs');

const TOKEN = 'peerlink-test-token-' + 'x'.repeat(40);
const PEER = 'arm64-test-node';

async function setup(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heavenzfire-peerlink-'));
  const journalPath = path.join(dir, 'events.jsonl');
  const hub = createPeerLinkHub({ token: TOKEN, host: '127.0.0.1', port: 0, journalPath, ...options });
  const address = await hub.listen();
  const base = 'http://127.0.0.1:' + address.port + '/';
  t.after(async () => {
    await hub.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { hub, base, journalPath, dir };
}

function request(base, route, token, body, method = 'POST') {
  return fetch(new URL(route, base), {
    method,
    headers: { authorization: 'Bearer ' + token, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

test('remote URLs require HTTPS while loopback development may use HTTP', () => {
  assert.equal(validateBaseUrl('http://127.0.0.1:18990/').hostname, '127.0.0.1');
  assert.equal(validateBaseUrl('https://peer.example/').hostname, 'peer.example');
  assert.throws(() => validateBaseUrl('http://peer.example/'), { code: 'https_required' });
  assert.throws(() => validateBaseUrl('https://user:pass@peer.example/'), { code: 'https_required' });
});

test('hub refuses weak secrets and non-loopback plaintext binds', () => {
  assert.throws(() => createPeerLinkHub({ token: 'short' }), /at least 32 characters/);
  assert.throws(() => createPeerLinkHub({ token: TOKEN, host: '0.0.0.0' }), /require TLS/);
});

test('authenticated registration echoes nonce and returns a scoped peer session', async t => {
  const { base } = await setup(t);
  const nonce = 'A'.repeat(32);
  const bad = await request(base, '/v1/peers/register', 'wrong-token', {
    protocol_version: 1, peer_id: PEER, client_nonce: nonce, capabilities: ['inference.chat']
  });
  assert.equal(bad.status, 401);
  const good = await request(base, '/v1/peers/register', TOKEN, {
    protocol_version: 1, peer_id: PEER, client_nonce: nonce, capabilities: ['inference.chat']
  });
  const data = await good.json();
  assert.equal(good.status, 200);
  assert.equal(data.client_nonce, nonce);
  assert.equal(data.protocol_version, 1);
  assert.ok(data.session_token.length >= 32);
});

test('agent claims bounded inference task, calls local runtime, and returns result', async t => {
  const { base } = await setup(t);
  const calls = [];
  const fakeFetch = async (url, init) => {
    const parsed = new URL(url);
    calls.push({ url: parsed.href, init });
    if (parsed.pathname === '/v1/chat/completions') {
      return Response.json({ model: 'hf-test-model', choices: [{ message: { content: 'PeerLink inference verified' } }], usage: { total_tokens: 9 } });
    }
    return fetch(url, init);
  };
  const agent = createPeerLinkAgent({
    hubUrl: base, token: TOKEN, peerId: PEER,
    inferenceUrl: 'http://127.0.0.1:11800', fetchImpl: fakeFetch
  });
  await agent.connect();
  // Submit through the controller credential, not the peer session.
  const queued = await request(base, '/v1/tasks', TOKEN, {
    task: {
      task_id: 'peerlink-task-1', idempotency_key: 'peerlink-idem-0001',
      type: 'inference.chat',
      payload: { model: 'hf-test-model', messages: [{ role: 'user', content: 'Return a short test string.' }], max_tokens: 32 }
    }
  });
  assert.equal(queued.status, 202);
  const result = await agent.runOnce();
  assert.equal(result.status, 'COMPLETED');
  const status = await fetch(new URL('/v1/tasks/peerlink-task-1', base), { headers: { authorization: 'Bearer ' + TOKEN } });
  const view = await status.json();
  assert.equal(view.task.status, 'COMPLETED');
  assert.equal(view.task.result.response, 'PeerLink inference verified');
  assert.ok(calls.some(call => new URL(call.url).pathname === '/v1/chat/completions'));
});

test('idempotency prevents duplicate queue records and task types are allowlisted', async t => {
  const { base } = await setup(t);
  const task = {
    task_id: 'peerlink-task-2', idempotency_key: 'peerlink-idem-0002',
    type: 'inference.chat',
    payload: { model: 'model-x', messages: [{ role: 'user', content: 'hello' }] }
  };
  const first = await request(base, '/v1/tasks', TOKEN, { task });
  const duplicate = await request(base, '/v1/tasks', TOKEN, { task: { ...task, task_id: 'peerlink-task-2b' } });
  assert.equal(first.status, 202);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  const rejected = await request(base, '/v1/tasks', TOKEN, { task: { ...task, idempotency_key: 'peerlink-idem-0003', type: 'shell.exec' } });
  assert.equal(rejected.status, 400);
});

test('append-only journal restores queued work after hub restart', async t => {
  const state = await setup(t);
  const queued = await request(state.base, '/v1/tasks', TOKEN, {
    task: {
      task_id: 'peerlink-durable-1', idempotency_key: 'peerlink-durable-0001',
      type: 'inference.chat', payload: { model: 'model-x', messages: [{ role: 'user', content: 'persist me' }] }
    }
  });
  assert.equal(queued.status, 202);
  await state.hub.close();
  const restarted = createPeerLinkHub({
    token: TOKEN, host: '127.0.0.1', port: 0, journalPath: state.journalPath
  });
  const address = await restarted.listen();
  const response = await fetch('http://127.0.0.1:' + address.port + '/v1/tasks/peerlink-durable-1', {
    headers: { authorization: 'Bearer ' + TOKEN }
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).task.status, 'QUEUED');
  await restarted.close();
  // prevent setup cleanup from attempting to close an already-closed server twice
  state.hub.close = async () => {};
});
