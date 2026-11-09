'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
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


test('malformed unauthenticated request target returns 400 without stopping the hub', async t => {
  const { base } = await setup(t);
  const port = Number(new URL(base).port);
  const response = await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let raw = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => {
      socket.write('GET // HTTP/1.1\\r\\nHost: 127.0.0.1\\r\\nConnection: close\\r\\n\\r\\n');
    });
    socket.on('data', chunk => { raw += chunk; });
    socket.on('end', () => resolve(raw));
    socket.on('error', reject);
  });
  assert.ok(response.startsWith('HTTP/1.1 400 '));

  const health = await fetch(new URL('/health', base));
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
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
});


test('orchestrator PeerLink client submits a bounded role task and waits for its worker result', async () => {
  const { invokePeerLinkRuntime } = require('./peerlink-client.cjs');
  const calls = [];
  let polls = 0;
  const result = await invokePeerLinkRuntime({
    agent: { id: 'security-reviewer', objective: 'Find concrete security failures.' },
    goal: 'Review the current transport boundary.',
    model: 'heavenzfire-qwen',
    peerLinkUrl: 'http://127.0.0.1:18990',
    peerLinkToken: TOKEN,
    timeoutMs: 5000,
    pollIntervalMs: 1,
    fetchImpl: async (url, init) => {
      const parsed = new URL(url);
      calls.push({ path: parsed.pathname, authorization: init.headers.authorization, body: init.body && JSON.parse(init.body) });
      if (parsed.pathname === '/v1/tasks') {
        return Response.json({ ok: true, task: { task_id: 'uf-test' } }, { status: 202 });
      }
      polls++;
      if (polls === 1) return Response.json({ ok: true, task: { status: 'QUEUED' } });
      return Response.json({ ok: true, task: {
        status: 'COMPLETED', peer_id: PEER,
        result: { model: 'heavenzfire-qwen', response: 'Found one bounded risk.', usage: { total_tokens: 20 } }
      } });
    }
  });
  assert.equal(result.state, 'completed');
  assert.equal(result.provider, 'peerlink');
  assert.equal(result.output, 'Found one bounded risk.');
  assert.equal(result.peerId, PEER);
  assert.equal(calls[0].path, '/v1/tasks');
  assert.equal(calls[0].authorization, 'Bearer ' + TOKEN);
  assert.equal(calls[0].body.task.type, 'inference.chat');
  assert.equal(calls[0].body.task.payload.messages[0].role, 'system');
  assert.equal(calls[0].body.task.payload.max_tokens, 256);
  assert.ok(calls.some(call => /^\/v1\/tasks\/uf-[0-9a-f-]{36}$/.test(call.path)));
});

test('PeerLink client rejects remote plaintext and malformed credentials', async () => {
  const { validatePeerLinkUrl, invokePeerLinkRuntime } = require('./peerlink-client.cjs');
  assert.throws(() => validatePeerLinkUrl('http://192.168.1.20:18990'), /https_or_loopback/);
  assert.throws(() => validatePeerLinkUrl('https://user:pass@example.net/'), /https_or_loopback/);
  await assert.rejects(() => invokePeerLinkRuntime({
    agent: { id: 'reviewer', objective: 'review' }, goal: 'test', model: 'm',
    peerLinkUrl: 'http://127.0.0.1:18990', peerLinkToken: 'short'
  }), /peerlink_bearer_token_required/);
});


test('real PeerLink hub, orchestrator client, and worker complete an end-to-end inference task', async t => {
  const { invokePeerLinkRuntime } = require('./peerlink-client.cjs');
  const { base } = await setup(t);
  const agentFetch = async (url, init) => {
    const parsed = new URL(url);
    if (parsed.port === '11800' && parsed.pathname === '/v1/chat/completions') {
      return Response.json({
        model: 'arm64-qwen-test',
        choices: [{ message: { content: 'End-to-end PeerLink inference passed.' } }],
        usage: { total_tokens: 17 }
      });
    }
    return fetch(url, init);
  };
  const agent = createPeerLinkAgent({
    hubUrl: base, token: TOKEN, peerId: PEER,
    inferenceUrl: 'http://127.0.0.1:11800', model: 'arm64-qwen-test',
    fetchImpl: agentFetch
  });
  await agent.connect();

  const resultPromise = invokePeerLinkRuntime({
    agent: { id: 'integration-reviewer', objective: 'Verify the actual transport round trip.' },
    goal: 'Return the integration test result.',
    model: 'arm64-qwen-test',
    peerLinkUrl: base,
    peerLinkToken: TOKEN,
    timeoutMs: 5000,
    pollIntervalMs: 5
  });
  const workerPromise = (async () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const outcome = await agent.runOnce();
      if (outcome.status === 'COMPLETED') return outcome;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('worker_task_not_received');
  })();

  const [result, worker] = await Promise.all([resultPromise, workerPromise]);
  assert.equal(worker.status, 'COMPLETED');
  assert.equal(result.state, 'completed');
  assert.equal(result.provider, 'peerlink');
  assert.equal(result.peerId, PEER);
  assert.equal(result.output, 'End-to-end PeerLink inference passed.');
});


test('duplicate peer registration cannot replace an existing authenticated session', async t => {
  const { base } = await setup(t);
  const registration = {
    protocol_version: 1, peer_id: 'unique-peer-node',
    client_nonce: 'B'.repeat(32), capabilities: ['inference.chat']
  };
  const first = await request(base, '/v1/peers/register', TOKEN, registration);
  assert.equal(first.status, 200);
  const firstSession = await first.json();

  const duplicate = await request(base, '/v1/peers/register', TOKEN, {
    ...registration, client_nonce: 'C'.repeat(32)
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error, 'peer_id_already_registered');

  const heartbeat = await request(base, '/v1/peers/heartbeat', firstSession.session_token, {
    peer_id: 'unique-peer-node'
  });
  assert.equal(heartbeat.status, 200);
});

test('hub constructor rejects incomplete TLS key or certificate configuration', () => {
  assert.throws(() => createPeerLinkHub({
    token: TOKEN, host: '0.0.0.0', tls: { key: 'non-empty-key' }
  }), /TLS requires non-empty key and certificate/);
  assert.throws(() => createPeerLinkHub({
    token: TOKEN, host: '127.0.0.1', tls: { cert: 'non-empty-cert' }
  }), /TLS requires non-empty key and certificate/);
  assert.throws(() => createPeerLinkHub({
    token: TOKEN, host: '127.0.0.1', tls: { key: '', cert: 'non-empty-cert' }
  }), /TLS requires non-empty key and certificate/);
});

test('result endpoint rejects oversized serialized inference results without completing the lease', async t => {
  const { base } = await setup(t);
  const registration = await request(base, '/v1/peers/register', TOKEN, {
    protocol_version: 1, peer_id: 'result-bound-peer',
    client_nonce: 'D'.repeat(32), capabilities: ['inference.chat']
  });
  assert.equal(registration.status, 200);
  const session = await registration.json();

  const queued = await request(base, '/v1/tasks', TOKEN, {
    task: {
      task_id: 'result-bound-task', idempotency_key: 'result-bound-idem-01',
      type: 'inference.chat',
      payload: { model: 'model-x', messages: [{ role: 'user', content: 'bounded result test' }] }
    }
  });
  assert.equal(queued.status, 202);

  const claimed = await request(base, '/v1/peers/poll', session.session_token, {
    peer_id: 'result-bound-peer'
  });
  assert.equal(claimed.status, 200);
  assert.equal((await claimed.json()).task.task_id, 'result-bound-task');

  const oversized = await request(base, '/v1/peers/result', session.session_token, {
    peer_id: 'result-bound-peer', task_id: 'result-bound-task',
    ok: true, result: { response: 'x'.repeat(49 * 1024) }
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error, 'result_payload_too_large');

  const status = await fetch(new URL('/v1/tasks/result-bound-task', base), {
    headers: { authorization: 'Bearer ' + TOKEN }
  });
  assert.equal((await status.json()).task.status, 'LEASED');
});

test('request JSON decoder preserves multibyte UTF-8 split across TCP chunks', async () => {
  const { EventEmitter } = require('node:events');
  const { readJson } = require('./peerlink-protocol.cjs');
  const requestStream = new EventEmitter();
  const bytes = Buffer.from(JSON.stringify({ content: 'before-€-after-🧪' }), 'utf8');
  const splitAt = bytes.indexOf(Buffer.from('€')) + 1;
  const parsedPromise = readJson(requestStream);
  requestStream.emit('data', bytes.subarray(0, splitAt));
  requestStream.emit('data', bytes.subarray(splitAt));
  requestStream.emit('end');
  assert.deepEqual(await parsedPromise, { content: 'before-€-after-🧪' });
});
