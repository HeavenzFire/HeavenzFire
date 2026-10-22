'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

const serverPath = path.join(__dirname, 'HeavenzFire-Unified-Intelligence-Server.cjs');

async function request(port, route, method = 'GET', body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1', port, path: route, method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
        ...headers,
      },
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = text; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    req.end(data || undefined);
  });
}

function startServer(t) {
  return new Promise((resolve, reject) => {
    const port = 14000 + Math.floor(Math.random() * 1000);
    const child = spawn(process.execPath, [serverPath], {
      env: { ...process.env, HF_UNIFIED_PORT: String(port), HF_UNIFIED_BASE_URL: 'http://127.0.0.1:1/v1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    child.stdout.on('data', data => { logs += data.toString(); });
    child.stderr.on('data', data => { logs += data.toString(); });
    const deadline = Date.now() + 5000;
    const probe = async () => {
      if (child.exitCode !== null) return reject(new Error('Server exited early: ' + logs));
      try {
        const result = await request(port, '/api/health');
        if (result.status === 200) {
          t.after(() => new Promise(done => {
            child.once('exit', done);
            child.kill();
            setTimeout(done, 1000).unref();
          }));
          resolve({ port, child });
          return;
        }
      } catch {}
      if (Date.now() > deadline) return reject(new Error('Server did not start: ' + logs));
      setTimeout(probe, 50);
    };
    probe();
  });
}

test('health and profile registry expose one shared model and session-only memory', async t => {
  const { port } = await startServer(t);
  const health = await request(port, '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.service, 'HeavenzFire Unified Intelligence');
  assert.equal(health.body.memoryPersistence, 'session-only');
  const profiles = await request(port, '/api/profiles');
  assert.equal(profiles.status, 200);
  assert.equal(profiles.body.profiles.length, 8);
  assert.equal(profiles.body.sharedModel, 'heavenzfire-qwen-0.5b');
});

test('rejects untrusted browser origins', async t => {
  const { port } = await startServer(t);
  const result = await request(port, '/api/profiles', 'GET', undefined, { Origin: 'https://example.com' });
  assert.equal(result.status, 403);
  assert.equal(result.body.error.code, 'ORIGIN_REJECTED');
});

test('returns a structured local-gateway failure instead of a canned answer', async t => {
  const { port } = await startServer(t);
  const result = await request(port, '/api/chat', 'POST', {
    sandboxId: 'test-sandbox',
    profileId: 'ibn_al_haytham',
    message: 'HF_UNIFIED_CANARY',
  });
  assert.equal(result.status, 503);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error.code, 'LOCAL_GATEWAY_UNREACHABLE');
  assert.ok(result.body.requestId);
});

test('rejects invalid sandbox identifiers', async t => {
  const { port } = await startServer(t);
  const result = await request(port, '/api/chat', 'POST', {
    sandboxId: '../unsafe',
    profileId: 'ibn_al_haytham',
    message: 'test',
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'INVALID_SANDBOX_ID');
});

test('serves the integrated Micro Mind UI and its local client adapter', async t => {
  const { port } = await startServer(t);
  const page = await request(port, '/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.body, /Unified Intelligence/);
  assert.match(page.body, /micro-mind-unified-client\.js/);
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);

  const client = await request(port, '/micro-mind-unified-client.js');
  assert.equal(client.status, 200);
  assert.match(client.headers['content-type'], /javascript/);
  assert.match(client.body, /createUnifiedClient/);
});

test('does not expose arbitrary filesystem paths through static routes', async t => {
  const { port } = await startServer(t);
  const result = await request(port, '/../../package.json');
  assert.equal(result.status, 404);
  assert.equal(result.body.error.code, 'NOT_FOUND');
});
