'use strict';

const ROLES = Object.freeze([
  'planner', 'builder', 'verifier', 'adversarial-reviewer',
  'policy-gate', 'evidence-curator', 'adapter-monitor', 'queue-reconciler'
]);
const TERMINAL = new Set(['SUCCEEDED', 'BLOCKED', 'FAILED', 'CONFLICT']);

function positiveInt(value, name, max) {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new RangeError(name + ' must be an integer from 1 to ' + max);
  }
  return value;
}

function createSimulation(options = {}) {
  const workerCount = positiveInt(options.workerCount ?? 16, 'workerCount', 256);
  const concurrency = positiveInt(options.concurrency ?? 4, 'concurrency', 32);
  const seed = Number.isInteger(options.seed) ? options.seed >>> 0 : 1;
  const workers = Array.from({ length: workerCount }, (_, index) => ({
    id: 'sim-worker-' + String(index + 1).padStart(3, '0'),
    role: ROLES[index % ROLES.length],
    status: 'SIMULATED_IDLE',
    currentTaskId: null,
    completed: 0
  }));
  const tasks = [];
  const seen = new Set();
  let nextSequence = 1;

  function enqueue(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('task must be an object');
    if (typeof input.taskId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(input.taskId)) throw new TypeError('taskId is invalid');
    if (seen.has(input.taskId)) return { accepted: false, reason: 'DUPLICATE_TASK_ID', taskId: input.taskId };
    if (!ROLES.includes(input.role)) throw new TypeError('unsupported worker role');
    if (input.requiredCapabilities !== undefined && (!Array.isArray(input.requiredCapabilities) || input.requiredCapabilities.some(x => typeof x !== 'string'))) {
      throw new TypeError('requiredCapabilities must be an array of strings');
    }
    const task = {
      taskId: input.taskId,
      parentTaskId: input.parentTaskId ?? null,
      mission: typeof input.mission === 'string' ? input.mission : 'general',
      role: input.role,
      requiredCapabilities: input.requiredCapabilities ?? [],
      inputDigest: typeof input.inputDigest === 'string' ? input.inputDigest : 'UNSPECIFIED',
      sequence: nextSequence++,
      state: 'QUEUED',
      result: null
    };
    seen.add(task.taskId);
    tasks.push(task);
    return { accepted: true, taskId: task.taskId, state: task.state };
  }

  function runBatch() {
    const ready = tasks.filter(task => task.state === 'QUEUED').slice(0, concurrency);
    const results = [];
    for (const task of ready) {
      const candidates = workers.filter(worker => worker.role === task.role);
      const worker = candidates.length ? candidates[(task.sequence - 1 + seed) % candidates.length] : null;
      const capabilityBlock = task.requiredCapabilities.length > 0;
      const state = (!worker || capabilityBlock) ? 'BLOCKED' : 'SUCCEEDED';
      if (worker) {
        worker.status = 'SIMULATED_RUNNING';
        worker.currentTaskId = task.taskId;
      }
      const result = {
        taskId: task.taskId,
        workerId: worker ? worker.id : null,
        workerRole: task.role,
        state,
        reason: !worker ? 'NO_SIMULATED_WORKER_FOR_ROLE' : capabilityBlock ? 'SIMULATION_HAS_NO_GRANTED_CAPABILITIES' : 'SIMULATION_ONLY_NO_SIDE_EFFECTS',
        inputDigest: task.inputDigest
      };
      task.state = state;
      task.result = result;
      if (worker) {
        worker.status = 'SIMULATED_IDLE';
        worker.currentTaskId = null;
        worker.completed += 1;
      }
      results.push(result);
    }
    return results;
  }

  function snapshot() {
    const counts = { QUEUED: 0, RUNNING: 0, SUCCEEDED: 0, BLOCKED: 0, FAILED: 0, CONFLICT: 0 };
    for (const task of tasks) if (Object.hasOwn(counts, task.state)) counts[task.state] += 1;
    return {
      mode: 'SIMULATION_ONLY',
      workerCount,
      concurrencyLimit: concurrency,
      activeWorkers: workers.filter(w => w.status === 'SIMULATED_RUNNING').length,
      workers: workers.map(w => ({ ...w })),
      counts,
      tasks: tasks.map(t => ({ ...t, requiredCapabilities: [...t.requiredCapabilities], result: t.result && { ...t.result } }))
    };
  }

  return Object.freeze({ enqueue, runBatch, snapshot });
}

module.exports = { ROLES, TERMINAL, createSimulation };