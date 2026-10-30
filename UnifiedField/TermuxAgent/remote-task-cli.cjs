'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createRemoteTaskClient } = require('../QuantumLab/uf-remote-task-client.cjs');

function readConfig(env = process.env) {
  const baseUrl = env.HF_REMOTE_TASK_URL;
  const token = env.HF_REMOTE_TASK_TOKEN;
  const allowedHosts = String(env.HF_REMOTE_TASK_HOSTS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!baseUrl) throw new Error('Set HF_REMOTE_TASK_URL to the configured HTTPS Serve origin.');
  if (!token) throw new Error('Set HF_REMOTE_TASK_TOKEN in this shell; never save it in a plan or source file.');
  if (!allowedHosts.length) throw new Error('Set HF_REMOTE_TASK_HOSTS to the exact allowed hostname.');
  return { baseUrl, token, allowedHosts };
}

function validateTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error('Task file must contain a JSON object.');
  const id = task.task_id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) throw new Error('task_id must be 1–128 safe identifier characters.');
  if (typeof task.objective !== 'string' || !task.objective.trim() || task.objective.length > 2000) throw new Error('objective must contain 1–2000 characters for the worker journal.');
  if (!Array.isArray(task.scope) || task.scope.length < 1 || task.scope.length > 16 ||
      task.scope.some(s => typeof s !== 'string' || !s.trim() || s.length > 120)) throw new Error('scope must be an array of 1–16 bounded strings.');
  if (!['LOW', 'MEDIUM'].includes(task.risk_class)) throw new Error('risk_class must be LOW or MEDIUM; higher-risk tasks require a separate reviewed workflow.');
  if (typeof task.idempotency_key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(task.idempotency_key)) throw new Error('idempotency_key must be a 1–128 character safe identifier.');
  return {
    task_id: id,
    objective: task.objective.trim(),
    scope: task.scope.map(s => s.trim()),
    risk_class: task.risk_class,
    idempotency_key: task.idempotency_key,
    approval_state: 'pending',
    source: 'heavenzfire-termux-agent'
  };
}

async function submitTaskFile(file, options = {}) {
  const task = validateTask(JSON.parse(await fs.readFile(path.resolve(file), 'utf8')));
  const client = options.client || createRemoteTaskClient(options.config || readConfig());
  const session = await client.connect();
  const submitted = await client.submitTask(task);
  // The worker API stores status inside its task object; tolerate the normalized
  // top-level status shape used by test doubles and compatible remote versions.
  const submittedStatus = submitted?.status ?? submitted?.task?.status;
  if (!submitted || !['QUEUED', 'proposed', 'pending'].includes(submittedStatus)) {
    throw new Error('Remote inbox did not confirm a queued proposal; no execution is claimed.');
  }

  // A successful POST is not sufficient evidence. Read the task back through the
  // authenticated API and verify identity + pending approval before reporting success.
  const tasks = await client.listTasks();
  if (!Array.isArray(tasks)) throw new Error('Remote read-back did not return a task list.');
  const stored = tasks.find(item => item && item.task_id === task.task_id);
  if (!stored) throw new Error('Remote task was accepted but could not be read back; verification failed.');
  if (stored.approval_state !== 'pending') throw new Error('Remote task read-back does not preserve approval_state=pending.');
  if (!['QUEUED', 'proposed', 'pending'].includes(stored.status)) {
    throw new Error('Remote task read-back has unexpected status: ' + String(stored.status));
  }

  return {
    schema: 'heavenzfire.termux-task-submission.v1',
    task_id: task.task_id,
    status: stored.status,
    duplicate: submitted.duplicate === true,
    approval_state: stored.approval_state,
    remote_readback_verified: true,
    execution_started: false,
    worker_instance_id: session.worker_instance_id,
    submitted_at: new Date().toISOString()
  };
}

async function main(argv) {
  const [command, file] = argv;
  if (!command || command === '--help' || command === 'help') {
    console.log('Usage: node UnifiedField/TermuxAgent/remote-task-cli.cjs submit <task.json>');
    console.log('Submission includes authenticated remote read-back verification.');
    console.log('Requires HF_REMOTE_TASK_URL, HF_REMOTE_TASK_HOSTS, and HF_REMOTE_TASK_TOKEN.');
    return;
  }
  if (command !== 'submit' || !file) throw new Error('Expected: submit <task.json>');
  console.log(JSON.stringify(await submitTaskFile(file), null, 2));
}

if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error('Remote task submission failed: ' + String(error.message || error));
  process.exitCode = 1;
});

module.exports = { readConfig, validateTask, submitTaskFile, main };
