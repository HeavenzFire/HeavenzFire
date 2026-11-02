'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server.cjs');

test('health is public and does not reveal credentials', async t => {
  process.env.HF_API_KEYS = 'test-only-key';
  process.env.GEMINI_API_KEY = 'not-a-real-test-secret';
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;

  const health = await fetch(base + '/health');
  assert.equal(health.status, 200);
  const data = await health.json();
  assert.equal(data.ok, true);
  assert.equal(data.service, 'heavenzfire-api');
  assert.equal(data.providers.geminiConfigured, true);
  assert.equal(JSON.stringify(data).includes('not-a-real-test-secret'), false);

  const denied = await fetch(base + '/v1/models');
  assert.equal(denied.status, 401);

  const accepted = await fetch(base + '/v1/models', { headers: { authorization: 'Bearer test-only-key' } });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).object, 'list');

  const invalid = await fetch(base + '/v1/generate', {
    method: 'POST',
    headers: { authorization: 'Bearer test-only-key', 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: '' })
  });
  assert.equal(invalid.status, 400);

  const unconfiguredProvider = await fetch(base + '/v1/generate', {
    method: 'POST',
    headers: { authorization: 'Bearer test-only-key', 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'mistral', model: 'mistral-small-latest', prompt: 'test' })
  });
  assert.equal(unconfiguredProvider.status, 503);
  const providerError = await unconfiguredProvider.json();
  assert.equal(providerError.error.code, 'provider_not_configured');
  assert.equal(JSON.stringify(providerError).includes('not-a-real-test-secret'), false);
});


test('OpenAI provider uses the Responses API and returns a compatible chat envelope', async t => {
  const oldFetch = global.fetch;
  const oldEnv = {
    HF_API_KEYS: process.env.HF_API_KEYS,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL
  };
  process.env.HF_API_KEYS = 'test-local-token';
  process.env.OPENAI_API_KEY = 'test-openai-key-not-real';
  process.env.OPENAI_MODEL = 'gpt-6-test-model';

  global.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.openai.com/')) {
      assert.equal(String(url), 'https://api.openai.com/v1/responses');
      assert.equal(options.headers.authorization, 'Bearer test-openai-key-not-real');
      const sent = JSON.parse(options.body);
      assert.equal(sent.model, 'gpt-6-test-model');
      assert.deepEqual(sent.input, [
        { role: 'system', content: 'system instruction' },
        { role: 'user', content: 'Say the test marker.' }
      ]);
      return new Response(JSON.stringify({ output_text: 'HEAVENZFIRE_GPT_RESPONSES_OK' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return oldFetch(url, options);
  };

  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    global.fetch = oldFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise(resolve => server.close(resolve));
  });

  const response = await fetch('http://127.0.0.1:' + server.address().port + '/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-local-token',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      provider: 'openai',
      model: 'gpt-6-test-model',
      messages: [
        { role: 'system', content: 'system instruction' },
        { role: 'user', content: 'Say the test marker.' }
      ]
    })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.model, 'gpt-6-test-model');
  assert.equal(result.choices[0].message.content, 'HEAVENZFIRE_GPT_RESPONSES_OK');
  assert.equal(JSON.stringify(result).includes('test-openai-key-not-real'), false);
});
