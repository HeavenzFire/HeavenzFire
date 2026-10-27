'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { verifyHandshakeResponse, performLoopbackHandshake } = require('./uf-handshake-client.cjs');
const { createWorkerServer } = require('./uf-local-worker.cjs');

const nonce = 'Q'.repeat(32);
function response(overrides = {}) {
  return {
    ok: true,
    protocol_version: 1,
    worker_instance_id: '0123456789abcdef0123456789abcdef',
    client_nonce: nonce,
    mode: 'OFFLINE',
    capabilities: ['task-metadata-journal', 'idempotency'],
    limitations: ['no-network-sync', 'no-automatic-replay'],
    nonce_ttl_ms: 120000,
    ...overrides
  };
}

test('accepts a well-formed response bound to the expected nonce and protocol', () => {
  const result = verifyHandshakeResponse(response(), nonce, 1);
  assert.equal(result.worker_instance_id, '0123456789abcdef0123456789abcdef');
  assert.equal(result.client_nonce, nonce);
  assert.equal(result.protocol_version, 1);
  assert.equal(result.mode, 'OFFLINE');
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.capabilities), true);
});

test('rejects absent, primitive, and array payloads', () => {
  for (const payload of [null, undefined, 'ok', 7, [], false]) {
    assert.throws(() => verifyHandshakeResponse(payload, nonce, 1), { code: 'invalid_handshake_response' });
  }
});

test('rejects a worker-side rejection and protocol mismatch', () => {
  assert.throws(() => verifyHandshakeResponse(response({ ok: false }), nonce, 1), { code: 'handshake_rejected' });
  assert.throws(() => verifyHandshakeResponse(response({ protocol_version: 2 }), nonce, 1), { code: 'protocol_version_mismatch' });
  assert.throws(() => verifyHandshakeResponse(response(), nonce, 0), { code: 'invalid_expected_protocol_version' });
});

test('rejects nonce mismatch and malformed expected nonce', () => {
  assert.throws(() => verifyHandshakeResponse(response({ client_nonce: 'R'.repeat(32) }), nonce, 1), { code: 'client_nonce_mismatch' });
  assert.throws(() => verifyHandshakeResponse(response(), 'short', 1), { code: 'invalid_expected_nonce' });
});

test('rejects malformed worker identity, mode, capabilities, limitations, and TTL', () => {
  const cases = [
    [{ worker_instance_id: 'not-a-worker-id' }, 'invalid_worker_identity'],
    [{ mode: 'MAYBE_CONNECTED' }, 'invalid_worker_mode'],
    [{ capabilities: ['ok', 4] }, 'invalid_capabilities'],
    [{ limitations: null }, 'invalid_limitations'],
    [{ nonce_ttl_ms: 0 }, 'invalid_nonce_ttl']
  ];
  for (const [overrides, code] of cases) {
    assert.throws(() => verifyHandshakeResponse(response(overrides), nonce, 1), { code });
  }
});

test('does not mutate the received handshake payload', () => {
  const payload = response();
  const before = JSON.stringify(payload);
  verifyHandshakeResponse(payload, nonce, 1);
  assert.equal(JSON.stringify(payload), before);
});

test('performs a real authenticated loopback handshake against the worker', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-handshake-client-'));
  const worker = createWorkerServer({ journalPath: path.join(dir, 'tasks.jsonl'), token: 'integration-token' });
  try {
    const address = await worker.listen(0);
    const result = await performLoopbackHandshake({
      baseUrl: 'http://127.0.0.1:' + address.port + '/',
      token: 'integration-token',
      protocolVersion: 1
    });
    assert.equal(result.protocol_version, 1);
    assert.match(result.worker_instance_id, /^[a-f0-9]{32}$/);
    assert.equal(result.mode, 'OFFLINE');
    assert.ok(result.capabilities.includes('task-metadata-journal'));
  } finally {
    await worker.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loopback handshake refuses remote hosts and never calls fetch for them', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('must not be called'); };
  await assert.rejects(
    performLoopbackHandshake({
      baseUrl: 'http://100.64.0.2:8798/',
      token: 'secret',
      protocolVersion: 1,
      fetchImpl
    }),
    { code: 'loopback_only' }
  );
  assert.equal(calls, 0);
});

test('loopback handshake fails closed on bad credentials and transport errors', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-handshake-client-'));
  const worker = createWorkerServer({ journalPath: path.join(dir, 'tasks.jsonl'), token: 'right-token' });
  try {
    const address = await worker.listen(0);
    const baseUrl = 'http://127.0.0.1:' + address.port + '/';
    await assert.rejects(
      performLoopbackHandshake({ baseUrl, token: 'wrong-token', protocolVersion: 1 }),
      { code: 'handshake_http_status' }
    );
    await assert.rejects(
      performLoopbackHandshake({
        baseUrl,
        token: 'right-token',
        protocolVersion: 1,
        fetchImpl: async () => { throw new Error('network unavailable'); }
      }),
      { code: 'handshake_transport_failed' }
    );
  } finally {
    await worker.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
