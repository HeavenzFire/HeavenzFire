'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHistoricalRuntime, LocalInferenceError, PROFILES } = require('./historical-profile-runtime.cjs');

function fakeFetch(reply, capture = {}) {
  return async (url, options) => {
    capture.url = url;
    capture.request = JSON.parse(options.body);
    return {
      ok: reply.ok !== false,
      status: reply.status || 200,
      async json() { return reply.body; },
    };
  };
}

test('registers eight historically informed profiles', () => {
  assert.equal(Object.keys(PROFILES).length, 8);
  assert.equal(PROFILES.ibn_al_haytham.name, 'Ibn al-Haytham');
});

test('routes all profiles through one configured local model with deterministic settings', async () => {
  const capture = {};
  const runtime = createHistoricalRuntime({ fetchImpl: fakeFetch({ body: { choices: [{ message: { content: 'Step: add a regression test.' } }] } }, capture) });
  const result = await runtime.respond({ profileId: 'ibn_al_haytham', message: 'Recommend one testable engineering step.' });
  assert.equal(capture.url, 'http://127.0.0.1:11800/v1/chat/completions');
  assert.equal(capture.request.model, 'heavenzfire-qwen-0.5b');
  assert.equal(capture.request.temperature, 0);
  assert.equal(capture.request.top_p, 1);
  assert.equal(capture.request.seed, 0);
  assert.match(capture.request.messages[0].content, /controlled tests|empirical observation/i);
  assert.equal(result.answer, 'Step: add a regression test.');
});

test('conversation history is isolated per profile', async () => {
  const requests = [];
  const runtime = createHistoricalRuntime({
    fetchImpl: async (url, options) => {
      const request = JSON.parse(options.body);
      requests.push(request);
      return { ok: true, status: 200, async json() { return { choices: [{ message: { content: 'ack' } }] }; } };
    },
  });
  await runtime.respond({ profileId: 'ibn_al_haytham', message: 'secret-alpha-context' });
  await runtime.respond({ profileId: 'ada_lovelace', message: 'separate-beta-context' });
  const adaMessages = requests[1].messages;
  assert.equal(adaMessages.some(message => message.content.includes('secret-alpha-context')), false);
  const ibnMessages = requests[1 - 1].messages;
  assert.equal(ibnMessages.some(message => message.content.includes('secret-alpha-context')), true);
});

test('reset clears only the selected profile memory', async () => {
  const requests = [];
  const runtime = createHistoricalRuntime({
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, status: 200, async json() { return { choices: [{ message: { content: 'ack' } }] }; } };
    },
  });
  await runtime.respond({ profileId: 'ibn_al_haytham', message: 'alpha-only' });
  await runtime.respond({ profileId: 'ada_lovelace', message: 'beta-only' });
  runtime.resetMemory('ibn_al_haytham');
  await runtime.respond({ profileId: 'ibn_al_haytham', message: 'after reset' });
  assert.equal(requests[2].messages.some(message => message.content.includes('alpha-only')), false);
  assert.equal(requests[2].messages.some(message => message.content.includes('beta-only')), false);
  assert.equal(requests[2].messages[0].role, 'system');
});

test('surfaces structured HTTP 500 detail rather than returning a generic answer', async () => {
  const runtime = createHistoricalRuntime({
    fetchImpl: fakeFetch({ ok: false, status: 500, body: { error: { message: 'model runner out of memory' } } }),
  });
  await assert.rejects(
    runtime.respond({ profileId: 'ibn_al_haytham', message: 'test' }),
    error => error instanceof LocalInferenceError &&
      error.code === 'LOCAL_INFERENCE_HTTP_ERROR' &&
      error.message.includes('HTTP 500') &&
      error.message.includes('out of memory'),
  );
});

test('rejects unknown profile and invalid message before inference', async () => {
  let calls = 0;
  const runtime = createHistoricalRuntime({ fetchImpl: async () => { calls++; } });
  await assert.rejects(runtime.respond({ profileId: 'not-a-profile', message: 'hello' }), /Unknown reasoning profile/);
  await assert.rejects(runtime.respond({ profileId: 'ibn_al_haytham', message: '  ' }), /Message must contain/);
  assert.equal(calls, 0);
});

test('refuses non-loopback inference URLs', () => {
  assert.throws(() => createHistoricalRuntime({ baseUrl: 'http://example.com/v1' }), /loopback only/);
});
