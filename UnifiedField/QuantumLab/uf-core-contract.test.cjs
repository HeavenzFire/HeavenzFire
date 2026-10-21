'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { OfflineTaskJournal } = require('./uf-bridge-journal.cjs');
const { createSimulation } = require('./uf-worker-legion-sim.cjs');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-core-contract-'));
  return {
    file: path.join(dir, 'queue.jsonl'),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true })
  };
}

function journalTask(overrides = {}) {
  return {
    task_id: 'contract-task-1',
    objective: 'Verify dry-run contract',
    scope: ['repository:read'],
    risk_class: 'R0',
    idempotency_key: 'contract-idem-1',
    ...overrides
  };
}

test('simulated success never marks the durable journal task as actually done', () => {
  const f = fixture();
  try {
    const journal = new OfflineTaskJournal(f.file);
    journal.enqueue(journalTask());
    const simulation = createSimulation({ workerCount: 8, concurrency: 2, seed: 7 });
    simulation.enqueue({ taskId: 'contract-task-1', role: 'verifier' });
    const [result] = simulation.runBatch();

    assert.equal(result.state, 'SUCCEEDED');
    assert.equal(result.reason, 'SIMULATION_ONLY_NO_SIDE_EFFECTS');
    assert.equal(simulation.snapshot().mode, 'SIMULATION_ONLY');
    assert.equal(journal.inspect().tasks[0].status, 'QUEUED');
    assert.equal(journal.evaluateReplay('contract-task-1', undefined).action, 'ELIGIBLE_FOR_REVALIDATION');
  } finally {
    f.cleanup();
  }
});

test('journal completion requires an explicit RUNNING transition', () => {
  const f = fixture();
  try {
    const journal = new OfflineTaskJournal(f.file);
    journal.enqueue(journalTask());
    assert.throws(() => journal.setState('contract-task-1', 'DONE'), /must be RUNNING/);
    journal.setState('contract-task-1', 'RUNNING', { attempts: 1 });
    assert.equal(journal.setState('contract-task-1', 'DONE').status, 'DONE');
    assert.equal(journal.evaluateReplay('contract-task-1', undefined).action, 'SKIP_ALREADY_DONE');
  } finally {
    f.cleanup();
  }
});

test('duplicate journal idempotency keys cannot create a second durable task', () => {
  const f = fixture();
  try {
    const journal = new OfflineTaskJournal(f.file);
    assert.equal(journal.enqueue(journalTask()).accepted, true);
    const duplicate = journal.enqueue(journalTask({ task_id: 'contract-task-2' }));
    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(journal.inspect().tasks.length, 1);
  } finally {
    f.cleanup();
  }
});
