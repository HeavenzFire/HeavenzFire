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
  for (const k of ['task_id', 'objective', 'scope', 'risk_class', 'idempotency_key']) {
    if (typeof task[k] !== 'string' || !task[k].trim()) throw new TypeError(k + ' is required');
  }
  if (task.objective.length > 2000) throw new RangeError('objective too long');
  if (!Array.isArray(task.scope) || task.scope.some(x => typeof x !== 'string')) throw new TypeError('scope must be a string array');
  if (task.command !== undefined || task.shell !== undefined || task.script !== undefined) {
    throw new TypeError('executable payloads are not accepted by the journal');
  }
}
function readJournal(file) {
  if (!fs.existsSync(file)) return { events: [], corruptLines: [] };
  const raw = fs.readFileSync(file, 'utf8');
  const events = [], corruptLines = [];
  raw.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const e = JSON.parse(line);
      if (!e || typeof e.event_id !== 'string' || typeof e.type !== 'string' || !e.payload) throw new Error('invalid event shape');
      events.push(e);
    } catch (err) { corruptLines.push({ line: i + 1, reason: err.message }); }
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
    if (status === 'RUNNING' && t.status !== 'QUEUED' && t.status !== 'BLOCKED') throw new Error('task cannot enter RUNNING from ' + t.status);
    if (status === 'DONE' && t.status !== 'RUNNING') throw new Error('task must be RUNNING before DONE');
    if (status === 'CONFLICT' && !details.last_error) throw new Error('conflict requires an explanatory last_error');
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
