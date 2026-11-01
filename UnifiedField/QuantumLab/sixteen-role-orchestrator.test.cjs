'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLES, validateEndpoint, runSixteenRoleField } = require('./sixteen-role-orchestrator.cjs');

test('registry has sixteen unique roles with resolvable dependencies', () => {
  assert.equal(ROLES.length, 16);
  const ids = new Set(ROLES.map(role => role.id));
  assert.equal(ids.size, 16);
  for (const role of ROLES) {
    assert.ok(Array.isArray(role.dependsOn));
    for (const dependency of role.dependsOn) assert.ok(ids.has(dependency), role.id + ' missing ' + dependency);
    assert.ok(!role.dependsOn.includes(role.id));
  }
});

test('endpoint guard permits loopback and rejects remote destinations and credentials', () => {
  assert.equal(validateEndpoint('http://127.0.0.1:11800').hostname, '127.0.0.1');
  assert.throws(() => validateEndpoint('https://example.com'), /loopback only/);
  assert.throws(() => validateEndpoint('http://user:pass@127.0.0.1:11800'), /credentials/);
  assert.throws(() => validateEndpoint('file:///tmp/model'), /HTTP\(S\) loopback/);
});

test('runs all roles through the DAG with bounded concurrency and retains semantic review', async () => {
  let active = 0;
  let peak = 0;
  const called = [];
  const result = await runSixteenRoleField({
    goal: 'Test a bounded local orchestration run.',
    endpoint: 'http://127.0.0.1:11800',
    maxParallel: 2,
    maxTokens: 128,
    invoke: async task => {
      active += 1;
      peak = Math.max(peak, active);
      called.push(task.roleId);
      await new Promise(resolve => setTimeout(resolve, 3));
      active -= 1;
      return { response: task.roleId + ': evidence is not supplied; verify before claiming success.', finishReason: 'stop', durationMs: 3 };
    }
  });
  assert.equal(result.roleCount, 16);
  assert.equal(result.counts.completed, 16);
  assert.equal(result.counts.failed, 0);
  assert.equal(result.counts.blocked, 0);
  assert.ok(peak <= 2);
  assert.equal(called.length, 16);
  assert.equal(result.qualityGate.passed, true);
  assert.equal(result.qualityGate.structuralChecksOnly, true);
  assert.equal(result.qualityGate.semanticReviewRequired, true);
  assert.equal(result.status, 'review_required');
  assert.equal(result.ok, false);
});

test('routes roles across configured local models and emits live progress events', async () => {
  const events = [];
  const calls = [];
  const roleModels = {
    architect: 'qwen2.5:0.5b',
    planner: 'heavenzfire-runtime:latest',
    researcher: 'heavenzfire:latest',
    requirements: 'llama3.2:1b'
  };
  const result = await runSixteenRoleField({
    goal: 'Verify per-role model routing and observable progress.',
    endpoint: 'http://127.0.0.1:11434',
    model: 'qwen2.5:0.5b',
    roleModels,
    maxParallel: 2,
    onProgress: event => events.push(event),
    invoke: async task => {
      calls.push({ roleId: task.roleId, model: task.model });
      return {
        response: task.roleId + ': bounded result; verify independently.',
        finishReason: 'stop',
        durationMs: 5,
        model: task.model
      };
    }
  });

  assert.equal(result.counts.completed, 16);
  assert.equal(calls.length, 16);
  for (const [roleId, model] of Object.entries(roleModels)) {
    assert.equal(calls.find(call => call.roleId === roleId).model, model);
    assert.equal(result.roleRecords.find(record => record.roleId === roleId).model, model);
  }
  assert.deepEqual(result.modelsUsed.sort(), [
    'heavenzfire-runtime:latest', 'heavenzfire:latest', 'llama3.2:1b', 'qwen2.5:0.5b'
  ]);
  assert.ok(events.some(event => event.type === 'run_started'));
  assert.equal(events.filter(event => event.type === 'role_started').length, 16);
  assert.equal(events.filter(event => event.type === 'role_completed').length, 16);
  assert.ok(events.some(event => event.type === 'run_finished'));
});

test('rejects unknown role-model mappings and invalid timeouts before dispatch', async () => {
  const invoke = async () => { throw new Error('must not dispatch'); };
  await assert.rejects(runSixteenRoleField({
    goal: 'invalid role mapping', roleModels: { not_a_role: 'model' }, invoke
  }), /unknown role/);
  await assert.rejects(runSixteenRoleField({
    goal: 'invalid timeout', timeoutMs: 999, invoke
  }), /timeoutMs must be 1000..120000/);
});

test('refusal detection handles leading whitespace', async () => {
  const result = await runSixteenRoleField({
    goal: 'Check whitespace-tolerant refusal handling.',
    invoke: async () => ({ response: '   I cannot assist with that request.', finishReason: 'stop' })
  });
  assert.equal(result.counts.reviewRequired, 1);
  assert.equal(result.counts.blocked, 15);
  assert.equal(result.roleRecords[0].refusal, true);
});

test('truncated architect output fails closed and blocks dependent roles', async () => {
  const called = [];
  const result = await runSixteenRoleField({
    goal: 'Check truncation handling.',
    invoke: async task => {
      called.push(task.roleId);
      return { response: 'partial output', finishReason: task.roleId === 'architect' ? 'length' : 'stop' };
    }
  });
  assert.equal(result.counts.reviewRequired, 1);
  assert.equal(result.counts.blocked, 15);
  assert.equal(result.counts.completed, 0);
  assert.deepEqual(called, ['architect']);
  assert.equal(result.qualityGate.passed, false);
});

test('refusal output is not counted as a completed role', async () => {
  const result = await runSixteenRoleField({
    goal: 'Check refusal handling.',
    invoke: async () => ({ response: 'I cannot assist with that request.', finishReason: 'stop' })
  });
  assert.equal(result.counts.reviewRequired, 1);
  assert.equal(result.counts.blocked, 15);
  assert.equal(result.roleRecords[0].refusal, true);
});

test('worker exceptions are recorded as failures and never become success', async () => {
  const result = await runSixteenRoleField({
    goal: 'Check worker crash handling.',
    invoke: async () => { throw new Error('synthetic worker crash'); }
  });
  assert.equal(result.counts.failed, 1);
  assert.equal(result.counts.blocked, 15);
  assert.match(result.roleRecords[0].error, /synthetic worker crash/);
});
