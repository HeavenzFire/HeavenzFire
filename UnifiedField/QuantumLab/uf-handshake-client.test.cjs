'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyHandshakeResponse } = require('./uf-handshake-client.cjs');

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
