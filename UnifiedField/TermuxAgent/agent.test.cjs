'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEndpoint, askLocal, createConversation, SYSTEM_PROMPT, MAX_HISTORY_MESSAGES } = require('./agent.cjs');

test('accepts loopback llama.cpp endpoint', () => {
  assert.equal(validateEndpoint('http://127.0.0.1:8080/v1/chat/completions').port, '8080');
  assert.equal(validateEndpoint('http://localhost:8080/v1/chat/completions').hostname, 'localhost');
});

test('rejects non-loopback, HTTPS, credentials, and unexpected paths', () => {
  for (const endpoint of [
    'http://192.168.1.5:8080/v1/chat/completions',
    'http://0.0.0.0:8080/v1/chat/completions',
    'https://127.0.0.1:8080/v1/chat/completions',
    'http://user:pass@127.0.0.1:8080/v1/chat/completions',
    'http://127.0.0.1:8080/api/chat'
  ]) assert.throws(() => validateEndpoint(endpoint));
});

test('sends non-streaming request and returns assistant content', async () => {
  let seen;
  const answer = await askLocal({
    endpoint: 'http://127.0.0.1:8080/v1/chat/completions',
    model: 'test-model',
    messages: [{ role: 'user', content: 'hello' }],
    fetchImpl: async (url, options) => {
      seen = { url: String(url), options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '  local answer  ' } }] }) };
    }
  });
  assert.equal(answer, 'local answer');
  assert.equal(seen.body.model, 'test-model');
  assert.equal(seen.body.stream, false);
  assert.equal(seen.body.messages[0].content, 'hello');
  assert.equal(seen.options.redirect, 'error');
});

test('reports HTTP failures and malformed responses', async () => {
  const base = { endpoint: 'http://127.0.0.1:8080/v1/chat/completions', model: 'x', messages: [] };
  await assert.rejects(askLocal({ ...base, fetchImpl: async () => ({ ok: false, status: 503 }) }), /local_inference_http_503/);
  await assert.rejects(askLocal({ ...base, fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [] }) }) }), /local_inference_empty_response/);
});

test('conversation retains system prompt and bounds prior messages', () => {
  const history = Array.from({ length: MAX_HISTORY_MESSAGES + 5 }, (_, i) => ({ role: 'user', content: String(i) }));
  const messages = createConversation(SYSTEM_PROMPT, history);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages.length, MAX_HISTORY_MESSAGES + 1);
  assert.equal(messages[1].content, '5');
});
