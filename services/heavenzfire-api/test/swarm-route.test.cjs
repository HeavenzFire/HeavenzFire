'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server.cjs');

test('authenticated swarm route fans out through the configured provider and persists evidence', async t => {
  const oldFetch = global.fetch;
  const keys = ['HF_API_KEYS', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'HF_SWARM_STATE_DIR'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hf-swarm-route-'));
  process.env.HF_API_KEYS = 'swarm-route-test-token';
  process.env.OPENAI_API_KEY = 'test-provider-key';
  process.env.OPENAI_MODEL = 'test-model';
  process.env.HF_SWARM_STATE_DIR = stateDir;

  let active = 0;
  let peak = 0;
  global.fetch = async (url, options) => {
    if (!String(url).startsWith('https://api.openai.com/')) return oldFetch(url, options);
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.authorization, 'Bearer test-provider-key');
    const request = JSON.parse(options.body);
    assert.equal(request.max_output_tokens, 512);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 8));
    active -= 1;
    const userInput = request.input.find(item => item.role === 'user').content;
    const agent = /Agent: ([a-z0-9-]+)/.exec(userInput);
    return new Response(JSON.stringify({ output_text: 'SWARM_OK_' + (agent ? agent[1] : 'UNKNOWN') }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    global.fetch = oldFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await new Promise(resolve => server.close(resolve));
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  const base = 'http://127.0.0.1:' + server.address().port;
  const denied = await fetch(base + '/v1/swarm/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mission: 'must not run', provider: 'openai' })
  });
  assert.equal(denied.status, 401);

  const response = await fetch(base + '/v1/swarm/run', {
    method: 'POST',
    headers: {
      authorization: 'Bearer swarm-route-test-token',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      mission: 'Analyze the test fixture and report concrete findings.',
      provider: 'openai',
      model: 'test-model',
      maxAgents: 16,
      concurrency: 16
    })
  });

  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.status, 'completed');
  assert.equal(report.plannedAgents, 16);
  assert.equal(report.completedAgents, 16);
  assert.equal(report.peakConcurrency, 16);
  assert.equal(peak, 16);
  assert.ok(report.evidenceFile);
  assert.equal((await fs.readdir(stateDir)).length, 1);
});

test('swarm endpoint rejects null JSON instead of throwing an internal error', async t => {
  const oldKeys = process.env.HF_API_KEYS;
  process.env.HF_API_KEYS = 'swarm-null-test-token';
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (oldKeys === undefined) delete process.env.HF_API_KEYS;
    else process.env.HF_API_KEYS = oldKeys;
    await new Promise(resolve => server.close(resolve));
  });

  const response = await fetch('http://127.0.0.1:' + server.address().port + '/v1/swarm/run', {
    method: 'POST',
    headers: {
      authorization: 'Bearer swarm-null-test-token',
      'content-type': 'application/json'
    },
    body: 'null'
  });
  assert.equal(response.status, 400);
});
