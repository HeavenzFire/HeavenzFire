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
