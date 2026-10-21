'use strict';

// Offline-first task-queue primitives. Pure functions only; persistence and adapters
// belong in a separate host module. Never executes arbitrary commands.
const MODES = Object.freeze(['ONLINE','OFFLINE','DEGRADED','RECONNECTING']);
const STATUS = Object.freeze(['QUEUED','RUNNING','DONE','BLOCKED','CONFLICT','FAILED']);

function validTask(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return false;
  return typeof t.task_id === 'string' && t.task_id.trim() !== '' &&
    typeof t.idempotency_key === 'string' && t.idempotency_key.trim() !== '' &&
    typeof t.objective === 'string' && t.objective.trim() !== '' &&
    Array.isArray(t.scope) && t.scope.every(s => typeof s === 'string') &&
    typeof t.risk_class === 'string' &&
    (t.target_commit_sha === null || t.target_commit_sha === undefined ||
      /^[a-f0-9]{40,64}$/i.test(t.target_commit_sha));
}

function enqueue(records, task) {
  const log = Array.isArray(records) ? records.slice() : [];
  if (!validTask(task)) return { ok:false, code:'INVALID_TASK', records:log };
  const existing = log.find(r => r && r.type === 'ENQUEUE' &&
    r.task && r.task.idempotency_key === task.idempotency_key);
  if (existing) return { ok:true, duplicate:true, task_id:existing.task.task_id, records:log };
  return { ok:true, duplicate:false, task_id:task.task_id,
    records:log.concat([{ type:'ENQUEUE', task:Object.freeze({...task, status:'QUEUED'}) }]) };
}

function replayDecision(task, currentCommit, handshake) {
  if (!validTask(task)) return { status:'BLOCKED', code:'INVALID_TASK' };
  if (!handshake || handshake.ok !== true || typeof handshake.nonce !== 'string' ||
      handshake.echoed_nonce !== handshake.nonce) {
    return { status:'BLOCKED', code:'HANDSHAKE_UNVERIFIED' };
  }
  if (!Array.isArray(handshake.capabilities) ||
      !task.scope.every(s => handshake.capabilities.includes(s))) {
    return { status:'BLOCKED', code:'CAPABILITY_MISSING' };
  }
  if (task.target_commit_sha && task.target_commit_sha !== currentCommit) {
    return { status:'CONFLICT', code:'TARGET_COMMIT_CHANGED' };
  }
  if (task.risk_class === 'privileged' || task.risk_class === 'destructive' ||
      task.risk_class === 'external-exposure') {
    return { status:'BLOCKED', code:'EXPLICIT_APPROVAL_REQUIRED' };
  }
  return { status:'QUEUED', code:'REPLAY_ELIGIBLE' };
}

function parseJournalLines(text) {
  const records = [], errors = [];
  String(text || '').split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const value = JSON.parse(line);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('record must be object');
      records.push(value);
    } catch (e) {
      errors.push({ line:index+1, code:'MALFORMED_JOURNAL_LINE' });
    }
  });
  return { records, errors };
}

module.exports = { MODES, STATUS, validTask, enqueue, replayDecision, parseJournalLines };
