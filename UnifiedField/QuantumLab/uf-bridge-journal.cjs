'use strict';

// Offline-first append-only task journal. This module records task metadata only;
// it never executes shell commands, opens network listeners, or stores credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const STATES = new Set(['QUEUED', 'RUNNING', 'DONE', 'BLOCKED', 'CONFLICT', 'FAILED']);
const MODES = new Set(['ONLINE', 'OFFLINE', 'DEGRADED', 'RECONNECTING']);

function stableId(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function validateTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) throw new TypeError('task must be an object');
  for (const k of ['task_id', 'objective', 'risk_class', 'idempotency_key']) {
    if (typeof task[k] !== 'string' || !task[k].trim()) throw new TypeError(k + ' is required');
  }
  if (task.objective.length > 2000) throw new RangeError('objective too long');
  if (!Array.isArray(task.scope) || task.scope.some(x => typeof x !== 'string')) throw new TypeError('scope must be a string array');
  if (task.command !== undefined || task.shell !== undefined || task.script !== undefined) {
    throw new TypeError('executable payloads are not accepted by the journal');
  }
}
function validateEvent(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e) ||
      typeof e.event_id !== 'string' || !e.event_id ||
      typeof e.type !== 'string' || !e.payload || typeof e.payload !== 'object' || Array.isArray(e.payload)) {
    throw new Error('invalid event shape');
  }
  if (e.type === 'TASK_ENQUEUED') {
    const t = e.payload.task;
    if (!t || typeof t !== 'object' || Array.isArray(t) ||
        typeof t.task_id !== 'string' || !t.task_id ||
        typeof t.idempotency_key !== 'string' || !t.idempotency_key) {
      throw new Error('invalid TASK_ENQUEUED payload');
    }
  } else if (e.type === 'TASK_STATE') {
    if (typeof e.payload.task_id !== 'string' || !e.payload.task_id ||
        !STATES.has(e.payload.status)) throw new Error('invalid TASK_STATE payload');
  } else {
    throw new Error('unsupported event type');
  }
  return e;
}
function readJournal(file) {
  if (!fs.existsSync(file)) return { events: [], corruptLines: [] };
  const raw = fs.readFileSync(file, 'utf8');
  const events = [], corruptLines = [];
  raw.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try { events.push(validateEvent(JSON.parse(line))); }
    catch (err) { corruptLines.push({ line: i + 1, reason: err.message }); }
  });
  return { events, corruptLines };
}
function materialize(events) {
  const tasks = new Map(), idempotency = new Map();
  for (const e of events) {
    const p = e.payload;
    if (e.type === 'TASK_ENQUEUED') {
      if (!tasks.has(p.task.task_id) && !idempotency.has(p.task.idempotency_key)) {
        tasks.set(p.task.task_id, { ...p.task, status: 'QUEUED', attempts: 0, last_error: null, target_commit_sha: p.task.target_commit_sha || null });
        idempotency.set(p.task.idempotency_key, p.task.task_id);
      }
    } else if (e.type === 'TASK_STATE' && tasks.has(p.task_id) && STATES.has(p.status)) {
      const t = tasks.get(p.task_id);
      tasks.set(p.task_id, { ...t, status: p.status, attempts: p.attempts ?? t.attempts, last_error: p.last_error ?? null });
    }
  }
  return [...tasks.values()];
}
class OfflineTaskJournal {
  constructor(file) {
    if (typeof file !== 'string' || !file.trim()) throw new TypeError('journal file path required');
    this.file = path.resolve(file);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (!fs.existsSync(this.file)) fs.closeSync(fs.openSync(this.file, 'a', 0o600));
  }
  _append(type, payload) {
    const event = { event_id: stableId(JSON.stringify([type, payload, fs.statSync(this.file).size])), type, recorded_utc: new Date().toISOString(), payload };
    const fd = fs.openSync(this.file, 'a', 0o600);
    try { fs.writeSync(fd, JSON.stringify(event) + '\n', null, 'utf8'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    return event;
  }
  inspect() {
    const r = readJournal(this.file);
    return { tasks: materialize(r.events), corruptLines: r.corruptLines, eventCount: r.events.length };
  }
  enqueue(task) {
    validateTask(task);
    const snapshot = this.inspect();
    const existing = snapshot.tasks.find(t => t.idempotency_key === task.idempotency_key);
    if (existing) return { accepted: false, duplicate: true, task: existing, corruptLines: snapshot.corruptLines };
    if (snapshot.tasks.some(t => t.task_id === task.task_id)) return { accepted: false, duplicate: true, task: snapshot.tasks.find(t => t.task_id === task.task_id), corruptLines: snapshot.corruptLines };
    const normalized = { ...task, scope: [...task.scope], dependencies: Array.isArray(task.dependencies) ? [...task.dependencies] : [], evidence_refs: Array.isArray(task.evidence_refs) ? [...task.evidence_refs] : [], created_utc: task.created_utc || new Date().toISOString() };
    this._append('TASK_ENQUEUED', { task: normalized });
    return { accepted: true, duplicate: false, task: { ...normalized, status: 'QUEUED', attempts: 0, last_error: null, target_commit_sha: normalized.target_commit_sha || null }, corruptLines: snapshot.corruptLines };
  }
  setState(taskId, status, details = {}) {
    if (!STATES.has(status)) throw new TypeError('unsupported task state');
    const t = this.inspect().tasks.find(x => x.task_id === taskId);
    if (!t) throw new Error('unknown task_id');
    const allowed = {
      QUEUED: new Set(['RUNNING', 'BLOCKED', 'CONFLICT', 'FAILED']),
      RUNNING: new Set(['DONE', 'BLOCKED', 'CONFLICT', 'FAILED']),
      BLOCKED: new Set(['RUNNING', 'CONFLICT', 'FAILED']),
      DONE: new Set(),
      CONFLICT: new Set(),
      FAILED: new Set()
    };
    if (!allowed[t.status] || !allowed[t.status].has(status)) {
      throw new Error('task cannot transition from ' + t.status + ' to ' + status);
    }
    if (status === 'CONFLICT' && (typeof details.last_error !== 'string' || !details.last_error.trim())) {
      throw new Error('conflict requires an explanatory last_error');
    }
    this._append('TASK_STATE', { task_id: taskId, status, attempts: details.attempts ?? t.attempts, last_error: details.last_error ?? null });
    return this.inspect().tasks.find(x => x.task_id === taskId);
  }
  evaluateReplay(taskId, currentCommitSha) {
    const t = this.inspect().tasks.find(x => x.task_id === taskId);
    if (!t) return { action: 'NOT_FOUND' };
    if (t.status === 'DONE') return { action: 'SKIP_ALREADY_DONE' };
    if (t.target_commit_sha && t.target_commit_sha !== currentCommitSha) return { action: 'CONFLICT', reason: 'TARGET_COMMIT_CHANGED', expected: t.target_commit_sha, actual: currentCommitSha };
    if (['CONFLICT', 'FAILED'].includes(t.status)) return { action: 'HOLD', reason: t.status };
    return { action: 'ELIGIBLE_FOR_REVALIDATION', requiresFreshEvidence: true, taskId: t.task_id };
  }
}
module.exports = { OfflineTaskJournal, validateTask, readJournal, materialize, STATES, MODES };
