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


test('tailnet-only mode restricts remote requests to the exact Tailscale peer and authenticates health', async t => {
  const oldKey = process.env.HF_API_KEYS;
  const token = 'tailnet-test-token-with-more-than-32-characters';
  process.env.HF_API_KEYS = token;
  const server = createServer({
    tailnetOnly: true,
    allowedTailnetClients: ['100.64.0.2'],
    remoteAddressResolver: () => '::ffff:100.64.0.2'
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (oldKey === undefined) delete process.env.HF_API_KEYS;
    else process.env.HF_API_KEYS = oldKey;
    await new Promise(resolve => server.close(resolve));
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(base + '/health')).status, 401);
  const health = await fetch(base + '/health', { headers: { authorization: 'Bearer ' + token } });
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, 'heavenzfire-api');
  const models = await fetch(base + '/v1/models', { headers: { authorization: 'Bearer ' + token } });
  assert.equal(models.status, 200);
});

test('tailnet-only mode denies a different Tailscale peer before application authentication', async t => {
  const oldKey = process.env.HF_API_KEYS;
  process.env.HF_API_KEYS = 'tailnet-test-token-with-more-than-32-characters';
  const server = createServer({
    tailnetOnly: true,
    allowedTailnetClients: ['100.64.0.2'],
    remoteAddressResolver: () => '100.64.0.3'
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (oldKey === undefined) delete process.env.HF_API_KEYS;
    else process.env.HF_API_KEYS = oldKey;
    await new Promise(resolve => server.close(resolve));
  });
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/health', {
    headers: { authorization: 'Bearer tailnet-test-token-with-more-than-32-characters' }
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, 'tailnet_peer_not_allowlisted');
});

test('tailnet-only mode fails closed without an exact Tailscale IPv4 allowlist', () => {
  assert.throws(() => createServer({ tailnetOnly: true, allowedTailnetClients: [] }), /exact_tailscale_ipv4_client_allowlist/);
  assert.throws(() => createServer({ tailnetOnly: true, allowedTailnetClients: ['192.168.1.20'] }), /exact_tailscale_ipv4_client_allowlist/);
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
