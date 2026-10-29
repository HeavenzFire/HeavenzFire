'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readConfig, validateTask, submitTaskFile } = require('./remote-task-cli.cjs');

const valid = {
  task_id: 'phone-task-001',
  objective: 'Review the integration boundary and return evidence-backed findings.',
  scope: ['github:read', 'analysis'],
  risk_class: 'LOW',
  idempotency_key: 'phone-task-001:v1'
};

test('validates bounded task proposal and rejects elevated risk', () => {
  assert.equal(validateTask(valid).approval_state, 'pending');
  assert.throws(() => validateTask({ ...valid, risk_class: 'HIGH' }), /risk_class/);
  assert.throws(() => validateTask({ ...valid, objective: ' ' }), /objective/);
  assert.throws(() => validateTask({ ...valid, objective: 'x'.repeat(2001) }), /1–2000/);
  assert.throws(() => validateTask({ ...valid, scope: [] }), /scope/);
  assert.throws(() => validateTask({ ...valid, task_id: '../escape' }), /task_id/);
});

test('requires remote URL, exact allowlist, and token from environment', () => {
  assert.throws(() => readConfig({}), /HF_REMOTE_TASK_URL/);
  assert.throws(() => readConfig({ HF_REMOTE_TASK_URL: 'https://host.example/', HF_REMOTE_TASK_HOSTS: 'host.example' }), /HF_REMOTE_TASK_TOKEN/);
  assert.deepEqual(readConfig({
    HF_REMOTE_TASK_URL: 'https://zdh.tailb4ab69.ts.net/',
    HF_REMOTE_TASK_HOSTS: 'zdh.tailb4ab69.ts.net',
    HF_REMOTE_TASK_TOKEN: 'test-token'
  }), {
    baseUrl: 'https://zdh.tailb4ab69.ts.net/',
    allowedHosts: ['zdh.tailb4ab69.ts.net'],
    token: 'test-token'
  });
});

test('submits, reads back the same task, and verifies pending approval', async () => {
  const calls = [];
  const client = {
    connect: async () => ({ worker_instance_id: '0123456789abcdef0123456789abcdef' }),
    submitTask: async task => {
      calls.push(task);
      return { status: 'QUEUED', duplicate: false, task };
    },
    listTasks: async () => [{ ...calls[0], status: 'QUEUED' }]
  };
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hf-termux-task-'));
  const file = path.join(dir, 'task.json');
  try {
    await fs.writeFile(file, JSON.stringify(valid));
    const result = await submitTaskFile(file, { client });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].approval_state, 'pending');
    assert.equal(result.remote_readback_verified, true);
    assert.equal(result.execution_started, false);
    assert.equal(result.worker_instance_id, '0123456789abcdef0123456789abcdef');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('fails closed when remote read-back omits the task or changes approval state', async () => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hf-termux-task-'));
  const file = path.join(dir, 'task.json');
  try {
    await fs.writeFile(file, JSON.stringify(valid));
    const missing = {
      connect: async () => ({ worker_instance_id: '0123456789abcdef0123456789abcdef' }),
      submitTask: async () => ({ status: 'QUEUED' }),
      listTasks: async () => []
    };
    await assert.rejects(submitTaskFile(file, { client: missing }), /could not be read back/);
    const changed = {
      connect: async () => ({ worker_instance_id: '0123456789abcdef0123456789abcdef' }),
      submitTask: async task => ({ status: 'QUEUED', task }),
      listTasks: async () => [{ ...validateTask(valid), status: 'QUEUED', approval_state: 'approved' }]
    };
    await assert.rejects(submitTaskFile(file, { client: changed }), /does not preserve approval_state=pending/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('fails closed when remote inbox does not confirm a proposal state', async () => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hf-termux-task-'));
  const file = path.join(dir, 'task.json');
  try {
    await fs.writeFile(file, JSON.stringify(valid));
    const client = {
      connect: async () => ({ worker_instance_id: '0123456789abcdef0123456789abcdef' }),
      submitTask: async () => ({ status: 'RUNNING' }),
      listTasks: async () => []
    };
    await assert.rejects(submitTaskFile(file, { client }), /did not confirm/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
