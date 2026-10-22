'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createTeamStore } = require('./team-ledger.cjs');

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'heavenzfire-team-'));
  fs.copyFileSync(path.join(__dirname, 'team-registry.json'), path.join(rootDir, 'team-registry.json'));
  return { rootDir, store: createTeamStore({ rootDir }) };
}

test('task registry and append-only ledger survive store reconstruction', () => {
  const f = fixture();
  try {
    const created = f.store.createTask({
      title: 'Test durable task recovery',
      owner: 'test',
      risk_class: 'LOW',
      idempotency_key: 'durable-test-1',
      payload: { acceptance: 'reopen store and find task' }
    });
    assert.equal(created.ok, true);
    assert.equal(created.task.status, 'proposed');
    const reopened = createTeamStore({ rootDir: f.rootDir });
    const snapshot = reopened.snapshot();
    assert.equal(snapshot.task_count, 1);
    assert.equal(snapshot.tasks[0].task_id, created.task.task_id);
    assert.equal(snapshot.tasks[0].status, 'proposed');
    assert.equal(snapshot.event_count, 1);
  } finally {
    fs.rmSync(f.rootDir, { recursive: true, force: true });
  }
});

test('idempotency key prevents duplicate task creation', () => {
  const f = fixture();
  try {
    const input = { title: 'Idempotent task', idempotency_key: 'same-key', risk_class: 'LOW' };
    const first = f.store.createTask(input);
    const second = f.store.createTask(input);
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.task.task_id, first.task.task_id);
    assert.equal(f.store.snapshot().task_count, 1);
  } finally {
    fs.rmSync(f.rootDir, { recursive: true, force: true });
  }
});

test('privileged and destructive tasks cannot be queued without explicit approval', () => {
  const f = fixture();
  try {
    const task = f.store.createTask({ title: 'Change firewall rule', risk_class: 'NETWORK_CHANGE' }).task;
    assert.equal(task.status, 'awaiting_approval');
    assert.equal(f.store.transitionTask(task.task_id, 'queued').error, 'invalid_task_transition');
    assert.equal(f.store.approveTask(task.task_id, { approved: false, approved_by: 'operator', reason: 'not approved' }).error, 'explicit_approval_required');
    const approved = f.store.approveTask(task.task_id, {
      approved: true, approved_by: 'human-operator', reason: 'Explicit test approval only'
    });
    assert.equal(approved.ok, true);
    assert.equal(approved.task.status, 'approved');
    assert.equal(f.store.transitionTask(task.task_id, 'queued').task.status, 'queued');
  } finally {
    fs.rmSync(f.rootDir, { recursive: true, force: true });
  }
});

test('task state machine rejects skipping the queue and terminal-state rewrites', () => {
  const f = fixture();
  try {
    const task = f.store.createTask({ title: 'State machine test', risk_class: 'LOW' }).task;
    assert.equal(f.store.transitionTask(task.task_id, 'running').error, 'invalid_task_transition');
    assert.equal(f.store.transitionTask(task.task_id, 'queued').task.status, 'queued');
    assert.equal(f.store.transitionTask(task.task_id, 'running').task.status, 'running');
    assert.equal(f.store.transitionTask(task.task_id, 'succeeded').task.status, 'succeeded');
    assert.equal(f.store.transitionTask(task.task_id, 'failed').error, 'invalid_task_transition');
  } finally {
    fs.rmSync(f.rootDir, { recursive: true, force: true });
  }
});

test('fabric messages are validated, durable, idempotent, and unclaimed until acknowledged', () => {
  const f = fixture();
  try {
    const input = {
      source: 'local-heavenzfire-agent',
      target: 'local-ollama',
      type: 'task',
      payload: { instruction: 'Return a short health summary; do not execute code.' },
      idempotency_key: 'message-once'
    };
    const first = f.store.queueMessage(input);
    const second = f.store.queueMessage(input);
    assert.equal(first.ok, true);
    assert.equal(first.message.delivery_status, 'queued');
    assert.equal(second.duplicate, true);
    assert.equal(f.store.snapshot().message_count, 1);

    const reopened = createTeamStore({ rootDir: f.rootDir });
    assert.equal(reopened.snapshot().messages[0].delivery_status, 'queued');
    const ack = reopened.acknowledgeMessage(first.message.message_id, {
      status: 'delivered', acknowledged_by: 'test-transport', detail: 'Fixture delivery only'
    });
    assert.equal(ack.ok, true);
    assert.equal(ack.message.delivery_status, 'delivered');
  } finally {
    fs.rmSync(f.rootDir, { recursive: true, force: true });
  }
});

test('unknown targets, invalid envelopes, and unverified provider promotion are rejected', () => {
  const f = fixture();
  try {
    assert.equal(f.store.queueMessage({
      source: 'test', target: 'not-registered', type: 'event', payload: {}
    }).error, 'message_target_not_registered');
    assert.throws(() => f.store.queueMessage({
      source: 'test', target: 'local-ollama', type: 'execute-anything', payload: {}
    }), /Unsupported message type/);
    assert.equal(f.store.recordProviderProbe('local-ollama', 'verified', 'CLI exists').error,
      'verified_status_requires_test_evidence');
    assert.equal(f.store.recordProviderProbe('not-registered', 'unknown', 'no evidence').error,
      'provider_not_registered');
  } finally {
    fs.rmSync(f.rootDir, { recursive: true, force: true });
  }
});

test('corrupt ledger fails closed rather than silently discarding evidence', () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.rootDir, 'team-events.jsonl'), '{"schema":"bad"}\n', 'utf8');
    assert.throws(() => createTeamStore({ rootDir: f.rootDir }), /team_ledger_invalid_event_1/);
  } finally {
    fs.rmSync(f.rootDir, { recursive: true, force: true });
  }
});