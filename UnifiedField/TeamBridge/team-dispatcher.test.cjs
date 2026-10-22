'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTeamStore } = require('./team-ledger.cjs');
const { createLocalOllamaDispatcher } = require('./team-dispatcher.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heavenzfire-dispatcher-'));
  fs.copyFileSync(path.join(__dirname, 'team-registry.json'), path.join(rootDir, 'team-registry.json'));
  return { rootDir, store: createTeamStore({ rootDir }) };
}

test('dispatch sends bounded prompt only to the loopback Ollama adapter and persists result', async () => {
  const f = fixture();
  try {
    let calledUrl = '';
    let body;
    const message = f.store.queueMessage({
      source: 'test',
      target: 'local-ollama',
      type: 'task',
      payload: { prompt: 'Return a test marker.', model: 'qwen2.5:0.5b' }
    }).message;
    const dispatcher = createLocalOllamaDispatcher({
      store: f.store,
      fetchImpl: async (url, options) => {
        calledUrl = url;
        body = JSON.parse(options.body);
        return { ok: true, status: 200, json: async () => ({
          model: 'qwen2.5:0.5b',
          message: { content: 'TEST_RESPONSE' }
        }) };
      }
    });
    const result = await dispatcher.dispatchOne(message.message_id);
    assert.equal(result.ok, true);
    assert.equal(calledUrl, 'http://127.0.0.1:11434/api/chat');
    assert.equal(body.model, 'qwen2.5:0.5b');
    assert.equal(body.stream, false);
    assert.equal(body.messages[1].content, 'Return a test marker.');
    assert.equal(result.result.response, 'TEST_RESPONSE');
    const reopened = createTeamStore({ rootDir: f.rootDir });
    const stored = reopened.snapshot().messages[0];
    assert.equal(stored.delivery_status, 'delivered');
    assert.equal(stored.result.response, 'TEST_RESPONSE');
  } finally {
    fs.rmSync(f.rootDir, { recursive: true, force: true });
  }
});

test('dispatcher rejects other providers and models outside the allowlist', async () => {
  const f = fixture();
  try {
    const external = f.store.queueMessage({
      source: 'test', target: 'claude', type: 'task', payload: { prompt: 'Hello' }
    }).message;
    const dispatcher = createLocalOllamaDispatcher({ store: f.store, fetchImpl: async () => {
      throw new Error('must not be called');
    }});
    assert.equal((await dispatcher.dispatchOne(external.message_id)).error, 'provider_not_supported_by_this_adapter');

    const invalidModel = f.store.queueMessage({
      source: 'test', target: 'local-ollama', type: 'task',
      payload: { prompt: 'Hello', model: 'not-allowlisted' }
    }).message;
    assert.equal((await dispatcher.dispatchOne(invalidModel.message_id)).error, 'model_not_allowlisted');
    assert.equal(f.store.snapshot().messages.find((m) => m.message_id === invalidModel.message_id).delivery_status, 'rejected');
  } finally {
    fs.rmSync(f.rootDir, { recursive: true, force: true });
  }
});

test('dispatcher rejects a non-loopback endpoint at construction', () => {
  const f = fixture();
  try {
    assert.throws(() => createLocalOllamaDispatcher({
      store: f.store,
      endpoint: 'http://0.0.0.0:11434/api/chat'
    }), /only_loopback_ollama_endpoint_allowed/);
  } finally {
    fs.rmSync(f.rootDir, { recursive: true, force: true });
  }
});