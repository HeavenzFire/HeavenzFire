'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSimulation, ROLES } = require('./uf-worker-legion-sim');

test('defaults to bounded logical workers and labels them simulated', () => {
  const sim = createSimulation();
  const state = sim.snapshot();
  assert.equal(state.mode, 'SIMULATION_ONLY');
  assert.equal(state.workerCount, 16);
  assert.ok(state.workers.every(w => w.status === 'SIMULATED_IDLE'));
});

test('same seed and task order produce deterministic worker assignments', () => {
  function run() {
    const sim = createSimulation({ workerCount: 12, concurrency: 3, seed: 42 });
    for (let i = 0; i < 6; i++) sim.enqueue({ taskId: 'task-' + i, role: ROLES[i % ROLES.length], inputDigest: 'fixture-' + i });
    return [sim.runBatch(), sim.runBatch()];
  }
  assert.deepEqual(run(), run());
});

test('duplicate task IDs are idempotently rejected', () => {
  const sim = createSimulation();
  assert.equal(sim.enqueue({ taskId: 'same', role: 'planner' }).accepted, true);
  assert.deepEqual(sim.enqueue({ taskId: 'same', role: 'planner' }), { accepted: false, reason: 'DUPLICATE_TASK_ID', taskId: 'same' });
});

test('capability requests block rather than grant authority', () => {
  const sim = createSimulation();
  sim.enqueue({ taskId: 'needs-network', role: 'adapter-monitor', requiredCapabilities: ['network'] });
  const [result] = sim.runBatch();
  assert.equal(result.state, 'BLOCKED');
  assert.equal(result.reason, 'SIMULATION_HAS_NO_GRANTED_CAPABILITIES');
});

test('batch processing never exceeds configured concurrency', () => {
  const sim = createSimulation({ workerCount: 24, concurrency: 5 });
  for (let i = 0; i < 20; i++) sim.enqueue({ taskId: 't-' + i, role: 'planner' });
  assert.equal(sim.runBatch().length, 5);
  assert.equal(sim.snapshot().counts.QUEUED, 15);
});

test('configuration bounds reject unbounded worker counts', () => {
  assert.throws(() => createSimulation({ workerCount: 1000000 }), RangeError);
  assert.throws(() => createSimulation({ concurrency: 999 }), RangeError);
});

test('invalid role and malformed task are rejected', () => {
  const sim = createSimulation();
  assert.throws(() => sim.enqueue({ taskId: 'x', role: 'superuser' }), /unsupported worker role/);
  assert.throws(() => sim.enqueue({ taskId: 'bad id', role: 'planner' }), /taskId is invalid/);
});

test('simulation never reports real execution', () => {
  const sim = createSimulation({ workerCount: 8 });
  sim.enqueue({ taskId: 'dry-run', role: 'verifier' });
  sim.runBatch();
  assert.equal(sim.snapshot().mode, 'SIMULATION_ONLY');
  assert.ok(sim.snapshot().workers.every(w => w.status.startsWith('SIMULATED_')));
});