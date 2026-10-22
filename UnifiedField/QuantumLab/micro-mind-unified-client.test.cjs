'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createUnifiedClient, normalizeBaseUrl, UnifiedClientError } = require('./micro-mind-unified-client.cjs');

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('only accepts loopback HTTP endpoints', () => {
  assert.equal(normalizeBaseUrl('http://127.0.0.1:11812/'), 'http://127.0.0.1:11812');
  assert.throws(() => normalizeBaseUrl('https://example.com'), /loopback/);
  assert.throws(() => normalizeBaseUrl('http://192.168.1.5:11812'), /loopback/);
  assert.throws(() => normalizeBaseUrl('http://user:pass@localhost:11812'), /loopback/);
});

test('GET health retries transient failures and records health', async () => {
  let calls = 0;
  const client = createUnifiedClient({
    timeoutMs: 1000,
    fetchImpl: async () => {
      calls++;
      if (calls < 3) throw new Error('temporary offline');
      return response(200, { ok: true, service: 'HeavenzFire Unified Intelligence' });
    },
  });
  const result = await client.health();
  assert.equal(result.ok, true);
  assert.equal(calls, 3);
  assert.ok(client.getDiagnostics().lastHealthyAt);
  assert.equal(client.getDiagnostics().consecutiveFailures, 0);
});

test('chat POST is never automatically retried after ambiguous failure', async () => {
  let calls = 0;
  const client = createUnifiedClient({
    timeoutMs: 1000,
    fetchImpl: async () => {
      calls++;
      throw new Error('connection reset after request');
    },
  });
  await assert.rejects(client.chat({ profileId: 'hypatia', message: 'canary' }), error => {
    assert.ok(error instanceof UnifiedClientError);
    assert.equal(error.code, 'API_UNREACHABLE');
    return true;
  });
  assert.equal(calls, 1);
});

test('chat sends scoped profile and sandbox and returns real answer', async () => {
  let sent;
  const client = createUnifiedClient({
    sandboxId: 'sandbox-A',
    fetchImpl: async (url, init) => {
      sent = { url, init, body: JSON.parse(init.body) };
      return response(200, { ok: true, answer: 'HF_UNIFIED_CANARY_OK', requestId: 'req-1' });
    },
  });
  const result = await client.chat({ profileId: 'hypatia', message: 'canary' });
  assert.equal(sent.url, 'http://127.0.0.1:11812/api/chat');
  assert.equal(sent.body.sandboxId, 'sandbox-A');
  assert.equal(sent.body.profileId, 'hypatia');
  assert.equal(result.answer, 'HF_UNIFIED_CANARY_OK');
});

test('structured API errors preserve code and request ID without fallback answers', async () => {
  const client = createUnifiedClient({
    fetchImpl: async () => response(503, {
      ok: false,
      requestId: 'req-fail',
      error: { code: 'LOCAL_GATEWAY_UNREACHABLE', message: 'Cannot connect to local inference gateway.', retryable: true },
    }),
  });
  await assert.rejects(client.chat({ profileId: 'hypatia', message: 'canary' }), error => {
    assert.equal(error.code, 'LOCAL_GATEWAY_UNREACHABLE');
    assert.equal(error.requestId, 'req-fail');
    assert.equal(error.status, 503);
    return true;
  });
});

test('memory reset uses the same sandbox and selected profile', async () => {
  let sent;
  const client = createUnifiedClient({
    sandboxId: 'sandbox-B',
    fetchImpl: async (url, init) => {
      sent = { url, body: JSON.parse(init.body) };
      return response(200, { ok: true, reset: true, profileId: 'ada_lovelace', turns: 0 });
    },
  });
  const result = await client.resetMemory('ada_lovelace');
  assert.equal(sent.url, 'http://127.0.0.1:11812/api/memory/reset');
  assert.equal(sent.body.sandboxId, 'sandbox-B');
  assert.equal(sent.body.profileId, 'ada_lovelace');
  assert.equal(result.reset, true);
});

test('validates profile and message before any network request', async () => {
  let calls = 0;
  const client = createUnifiedClient({ fetchImpl: async () => { calls++; return response(200, {}); } });
  await assert.rejects(client.chat({ profileId: '', message: 'hello' }), /Choose a reasoning profile/);
  await assert.rejects(client.chat({ profileId: 'hypatia', message: ' ' }), /Message must contain/);
  assert.equal(calls, 0);
});
