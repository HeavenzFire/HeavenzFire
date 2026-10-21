'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('./voice-service.cjs');

test('voice service is loopback-capable and reports synthesis honestly as unconfigured', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const base = 'http://127.0.0.1:' + address.port;
    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.ok, true);
    assert.equal(health.synthesis, 'not_configured');
    const status = await (await fetch(base + '/api/voice/status')).json();
    assert.equal(status.synthesis.identityModel, false);
    assert.equal(status.integrations.digitalBrain, 'not_connected');
    const catalogResponse = await fetch(base + '/api/voice/catalog');
    const catalog = await catalogResponse.json();
    assert.equal(catalog.ok, true);
    assert.equal(catalog.fileCount, 0);
    const denied = await fetch(base + '/api/voice/status', { method: 'POST' });
    assert.equal(denied.status, 405);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
