'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePlan, runPlan, MAX_PARALLEL } = require('./orchestrate.cjs');
test('validates unique bounded task plans and concurrency', () => {
  assert.equal(validatePlan({ tasks: [{ id: 'a', prompt: 'alpha' }] }).parallelism, 4);
  assert.throws(() => validatePlan({ tasks: [] }), /1 to/);
  assert.throws(() => validatePlan({ tasks: [{ id: 'a', prompt: 'x' }, { id: 'a', prompt: 'y' }] }), /Duplicate/);
  assert.throws(() => validatePlan({ parallelism: MAX_PARALLEL + 1, tasks: [{ id: 'a', prompt: 'x' }] }), /parallelism/);
  assert.throws(() => validatePlan({ tasks: [{ id: 'bad id', prompt: 'x' }] }), /invalid id/);
  assert.throws(() => validatePlan({ tasks: [{ id: 'a', prompt: '' }] }), /prompt/);
});
test('fans out bounded tasks and records success/failure per task', async () => {
  let active = 0, peak = 0;
  const report = await runPlan({ parallelism: 2, tasks: [{ id: 'one', prompt: 'first' }, { id: 'two', prompt: 'second' }, { id: 'three', prompt: 'third' }] }, {
    endpoint: 'http://127.0.0.1:8080/v1/chat/completions', model: 'fake-model',
    askLocal: async ({ messages }) => {
      active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active--;
      const prompt = messages[1].content;
      if (prompt.includes('Task ID: two')) throw new Error('simulated worker failure');
      return 'result for ' + prompt.match(/Task ID: (\w+)/)[1];
    }
  });
  assert.equal(report.task_count, 3); assert.equal(report.succeeded, 2); assert.equal(report.failed, 1); assert.equal(peak, 2);
  assert.deepEqual(report.results.map(x => x.status), ['succeeded', 'failed', 'succeeded']);
  assert.match(report.run_id, /^[0-9a-f-]{36}$/);
});
test('rejects non-loopback inference endpoints before dispatch', async () => {
  await assert.rejects(runPlan({ tasks: [{ id: 'a', prompt: 'x' }] }, { endpoint: 'http://192.168.1.9:8080/v1/chat/completions', askLocal: async () => 'should not run' }), /loopback/);
});
