'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createOrchestrator, readManifest, runBounded } = require('./orchestrator.cjs');

async function withServer(options, fn) {
  const app = createOrchestrator({ port: 0, invoke: async ({ agent }) => ({ agentId: agent.id, state: 'completed', output: 'verified-test-stub' }), ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  try { await fn('http://127.0.0.1:' + address.port); }
  finally { await new Promise(resolve => app.server.close(resolve)); }
}

test('manifest contains 16 unique named roles and caps parallelism at four', () => {
  const manifest = readManifest();
  assert.equal(manifest.agents.length, 16);
  assert.equal(new Set(manifest.agents.map(agent => agent.id)).size, 16);
  assert.ok(manifest.maxParallel >= 1 && manifest.maxParallel <= 4);
});

test('refuses non-loopback bind addresses', () => {
  assert.throws(() => createOrchestrator({ host: '0.0.0.0' }), /must_bind_loopback/);
});

test('proposal cannot run until explicit approval and then fans out to all 16 roles', async () => {
  let calls = 0;
  await withServer({ invoke: async ({ agent }) => { calls++; return { agentId: agent.id, state: 'completed', output: 'ok' }; } }, async base => {
    const created = await fetch(base + '/api/tasks', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ goal: 'Review the local orchestrator safely.' }) });
    assert.equal(created.status, 201);
    const task = (await created.json()).task;
    assert.equal(task.state, 'proposed');
    const denied = await fetch(base + '/api/tasks/' + task.id + '/run', { method: 'POST', headers: {'content-type':'application/json'}, body: '{}' });
    assert.equal(denied.status, 409);
    assert.equal(calls, 0);
    const approved = await fetch(base + '/api/tasks/' + task.id + '/approve', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ approve: true }) });
    assert.equal(approved.status, 200);
    const ran = await fetch(base + '/api/tasks/' + task.id + '/run', { method: 'POST', headers: {'content-type':'application/json'}, body: '{}' });
    assert.equal(ran.status, 200);
    const result = await ran.json();
    assert.equal(result.completedRoles, 16);
    assert.equal(result.task.results.length, 16);
    assert.equal(calls, 16);
  });
});

test('bounded worker pool never exceeds declared concurrency', async () => {
  let active = 0, maximum = 0;
  const results = await runBounded(Array.from({length:16}, (_, i) => i), 4, async value => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 3));
    active--;
    return value;
  });
  assert.equal(results.length, 16);
  assert.equal(maximum, 4);
});

test('rejects oversized goals and invalid approval payload', async () => {
  await withServer({}, async base => {
    const oversized = await fetch(base + '/api/tasks', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({goal:'x'.repeat(5000)}) });
    assert.equal(oversized.status, 400);
    const created = await fetch(base + '/api/tasks', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({goal:'test approval validation'}) });
    const task = (await created.json()).task;
    const approval = await fetch(base + '/api/tasks/' + task.id + '/approve', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({approve:false}) });
    assert.equal(approval.status, 400);
  });
});
