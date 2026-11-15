'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}
async function waitForHealth(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error('Bridge exited before health check.');
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Temporary BrowserBridge did not become healthy.');
}

test('144A browser-run API executes approved scoped Edge task and rejects unsafe requests', { timeout: 30000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-browser-api-test-'));
  const home = path.join(root, 'HeavenzFire');
  const tasks = path.join(home, '144A', 'tasks');
  fs.mkdirSync(tasks, { recursive: true });
  fs.writeFileSync(path.join(home, 'HeavenzFire-144A-Registry.json'), JSON.stringify({ agents:[{id:'T001',name:'Researcher',topology:'thinker'}] }));
  const taskId = 'HF-BROWSER-TEST01';
  fs.writeFileSync(path.join(tasks, taskId + '.json'), JSON.stringify({
    schema: 'heavenzfire-task-v1', id: taskId, title: 'Browser API integration test',
    goal: 'Verify an approved browser task.', status: 'Planned',
    created: new Date().toISOString(), updated: new Date().toISOString(), events: []
  }, null, 2));
  const fixture = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><head><title>HF Browser API Fixture</title></head><body><button id="go" onclick="document.getElementById(\'status\').textContent=\'clicked\'">Run</button><p id="status">ready</p></body></html>');
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const fixturePort = fixture.address().port;
  const bridgePort = await freePort();
  const bridge = spawn(process.execPath, [path.join(__dirname, 'bridge-server.cjs')], {
    cwd: __dirname,
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, USERPROFILE: root, HF_BROWSER_BRIDGE_PORT: String(bridgePort), HF_DISABLE_BROWSER_WORKER: '1' }
  });
  try {
    const base = 'http://127.0.0.1:' + bridgePort;
    await waitForHealth(base + '/health', bridge);
    const browserTask = {
      url: 'http://127.0.0.1:' + fixturePort + '/',
      allowedOrigins: ['http://127.0.0.1:' + fixturePort],
      actions: [{ type: 'click', selector: '#go' }],
      assertions: [
        { type: 'titleEquals', expected: 'HF Browser API Fixture' },
        { type: 'textEquals', selector: '#status', expected: 'clicked' }
      ],
      timeoutMs: 10000
    };
    const response = await fetch(base + '/api/tasks/' + taskId + '/browser-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ approved: true, browserTask })
    });
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.browserResult.status, 'PASS');
    assert.equal(data.task.status, 'ReviewRequired');
    assert.equal(data.task.browserRun.status, 'PASS');
    assert.ok(data.task.events.some(x => x.event === 'BrowserTaskFinished'));

    const noApproval = await fetch(base + '/api/tasks/' + taskId + '/browser-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ approved: false, browserTask })
    });
    assert.equal(noApproval.status, 403);

    const wildcard = await fetch(base + '/api/tasks/' + taskId + '/browser-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ approved: true, browserTask: { ...browserTask, allowedOrigins: ['*'] } })
    });
    assert.equal(wildcard.status, 400);

    const queuedSpec = {
      url: 'http://127.0.0.1:' + fixturePort + '/',
      allowedOrigins: ['http://127.0.0.1:' + fixturePort],
      actions: [{ type: 'extractText', selector: '#status', maxChars: 100 }],
      assertions: [{ type: 'titleEquals', expected: 'HF Browser API Fixture' }],
      timeoutMs: 10000
    };
    const queued = await fetch(base + '/api/automation/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ approved: true, title: 'Read-only browser queue test', goal: 'Extract fixture text and verify title.', browserTask: queuedSpec })
    });
    const queuedData = await queued.json();
    assert.equal(queued.status, 202, JSON.stringify(queuedData));
    assert.equal(queuedData.task.status, 'BrowserQueued');
    assert.equal(queuedData.task.browserAutomation.approved, true);

    const denied = await fetch(base + '/api/automation/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ approved: false, title: 'Denied job', goal: 'Must not queue.', browserTask: queuedSpec })
    });
    assert.equal(denied.status, 403);

    const writeAction = await fetch(base + '/api/automation/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ approved: true, title: 'Unsafe job', goal: 'Must be rejected.', browserTask: { ...queuedSpec, actions: [{ type: 'click', selector: '#go' }] } })
    });
    assert.equal(writeAction.status, 400);
  } finally {
    bridge.kill();
    await new Promise(resolve => fixture.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});