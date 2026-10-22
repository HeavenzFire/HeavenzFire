'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRestartPolicy } = require('./unified-restart-policy.cjs');

test('restart budget allows bounded exponential recovery then fails closed', () => {
  const policy = createRestartPolicy({ maxRestarts: 3, windowMs: 60000, baseDelayMs: 1000, maxDelayMs: 5000 });
  assert.deepEqual(policy.recordRestart(1000), { allowed: true, count: 1, delayMs: 1000, windowMs: 60000 });
  assert.deepEqual(policy.recordRestart(2000), { allowed: true, count: 2, delayMs: 2000, windowMs: 60000 });
  assert.deepEqual(policy.recordRestart(3000), { allowed: true, count: 3, delayMs: 4000, windowMs: 60000 });
  assert.deepEqual(policy.recordRestart(4000), { allowed: false, count: 3, delayMs: null, windowMs: 60000 });
});

test('restart budget releases old failures after the rolling window expires', () => {
  const policy = createRestartPolicy({ maxRestarts: 2, windowMs: 60000, baseDelayMs: 1000 });
  assert.equal(policy.recordRestart(1000).allowed, true);
  assert.equal(policy.recordRestart(2000).allowed, true);
  assert.equal(policy.recordRestart(3000).allowed, false);
  assert.equal(policy.recordRestart(61000).allowed, true);
  assert.equal(policy.snapshot(61000).count, 2);
});
