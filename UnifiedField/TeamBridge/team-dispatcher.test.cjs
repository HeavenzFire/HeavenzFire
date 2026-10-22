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
    assert.equal(result.result.policy_decision.decision, 1);
    assert.equal(result.result.policy_decision.label, 'allow');
    assert.match(result.result.evidence_refs[0], /^sha256:[a-f0-9]{64}$/);
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

test('explicit policy deny blocks inference before network access and persists decision', async () => {
  const f = fixture();
  try {
    const message = f.store.queueMessage({
      source: 'test', target: 'local-ollama', type: 'task',
      payload: { prompt: 'Must not be sent.', model: 'qwen2.5:0.5b' }
    }).message;
    let calls = 0;
    const dispatcher = createLocalOllamaDispatcher({
      store: f.store,
      policy: { allowActions: ['inference.local'], denyActions: ['inference.local'], requireApproval: false },
      fetchImpl: async () => { calls += 1; throw new Error('must_not_call'); }
    });
    const result = await dispatcher.dispatchOne(message.message_id);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'policy_deny');
    assert.equal(result.policy_decision.reasons.includes('policy_explicit_deny'), true);
    assert.equal(calls, 0);
    const stored = createTeamStore({ rootDir: f.rootDir }).snapshot().messages[0];
    assert.equal(stored.delivery_status, 'rejected');
    assert.equal(stored.result.policy_decision.label, 'deny');
  } finally { fs.rmSync(f.rootDir, { recursive: true, force: true }); }
});

test('required approval abstains and blocks inference when no trusted approval exists', async () => {
  const f = fixture();
  try {
    const message = f.store.queueMessage({
      source: 'test', target: 'local-ollama', type: 'task',
      payload: { prompt: 'Must not be sent.', model: 'qwen2.5:0.5b' }
    }).message;
    let calls = 0;
    const dispatcher = createLocalOllamaDispatcher({
      store: f.store,
      policy: { allowActions: ['inference.local'], denyActions: [], requireApproval: true },
      fetchImpl: async () => { calls += 1; throw new Error('must_not_call'); }
    });
    const result = await dispatcher.dispatchOne(message.message_id);
    assert.equal(result.error, 'policy_abstain');
    assert.equal(result.policy_decision.reasons.includes('approval_pending'), true);
    assert.equal(calls, 0);
  } finally { fs.rmSync(f.rootDir, { recursive: true, force: true }); }
});

test('approval must be scoped to the exact task and action', async () => {
  const f = fixture();
  try {
    const message = f.store.queueMessage({
      source: 'test', target: 'local-ollama', type: 'task',
      payload: { prompt: 'Must not be sent.', model: 'qwen2.5:0.5b' }
    }).message;
    let calls = 0;
    const dispatcher = createLocalOllamaDispatcher({
      store: f.store,
      policy: { allowActions: ['inference.local'], denyActions: [], requireApproval: true },
      approvalForMessage: async () => ({ status: 'approved', action: 'inference.local', taskId: 'another-task' }),
      fetchImpl: async () => { calls += 1; throw new Error('must_not_call'); }
    });
    const result = await dispatcher.dispatchOne(message.message_id);
    assert.equal(result.error, 'policy_deny');
    assert.equal(result.policy_decision.reasons.includes('approval_scope_mismatch'), true);
    assert.equal(calls, 0);
  } finally { fs.rmSync(f.rootDir, { recursive: true, force: true }); }
});

test('policy provider failures fail closed before inference', async () => {
  const f = fixture();
  try {
    const message = f.store.queueMessage({
      source: 'test', target: 'local-ollama', type: 'task',
      payload: { prompt: 'Must not be sent.', model: 'qwen2.5:0.5b' }
    }).message;
    let calls = 0;
    const dispatcher = createLocalOllamaDispatcher({
      store: f.store,
      policyForMessage: async () => { throw new Error('policy unavailable'); },
      fetchImpl: async () => { calls += 1; throw new Error('must_not_call'); }
    });
    const result = await dispatcher.dispatchOne(message.message_id);
    assert.equal(result.error, 'policy_provider_failed');
    assert.equal(calls, 0);
    assert.equal(f.store.snapshot().messages[0].delivery_status, 'rejected');
  } finally { fs.rmSync(f.rootDir, { recursive: true, force: true }); }
});


test('task payload cannot override the adapter-owned policy action', async () => {
  const f = fixture();
  try {
    const message = f.store.queueMessage({
      source: 'test', target: 'local-ollama', type: 'task',
      payload: { action: 'repo.delete', prompt: 'Return safe marker.', model: 'qwen2.5:0.5b' }
    }).message;
    const dispatcher = createLocalOllamaDispatcher({
      store: f.store,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({
        model: 'qwen2.5:0.5b', message: { content: 'SAFE' }
      }) })
    });
    const result = await dispatcher.dispatchOne(message.message_id);
    assert.equal(result.ok, true);
    assert.equal(result.result.policy_decision.action, 'inference.local');
    assert.equal(result.result.policy_decision.label, 'allow');
  } finally { fs.rmSync(f.rootDir, { recursive: true, force: true }); }
});

test('a valid task-and-action-scoped approval allows policy requiring approval', async () => {
  const f = fixture();
  try {
    const message = f.store.queueMessage({
      source: 'test', target: 'local-ollama', type: 'task',
      payload: { prompt: 'Return approved marker.', model: 'qwen2.5:0.5b' }
    }).message;
    const dispatcher = createLocalOllamaDispatcher({
      store: f.store,
      policy: { allowActions: ['inference.local'], denyActions: [], requireApproval: true },
      approvalForMessage: async ({ taskId, action }) => ({ status: 'approved', action, taskId }),
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({
        model: 'qwen2.5:0.5b', message: { content: 'APPROVED' }
      }) })
    });
    const result = await dispatcher.dispatchOne(message.message_id);
    assert.equal(result.ok, true);
    assert.equal(result.result.policy_decision.decision, 1);
  } finally { fs.rmSync(f.rootDir, { recursive: true, force: true }); }
});
