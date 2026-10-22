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
