'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA = 'heavenzfire.evidence-ledger.v1';
const ZERO_HASH = '0'.repeat(64);
const HASH_RE = /^[a-f0-9]{64}$/;

function bounded(value, field, max) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(field + ' must be a non-empty string');
  const result = value.trim();
  if (result.length > max) throw new RangeError(field + ' exceeds ' + max + ' characters');
  return result;
}

function normalizeSourceUrl(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2000) throw new TypeError('sourceUrl must be an HTTP(S) URL no longer than 2000 characters');
  let url;
  try { url = new URL(value); } catch { throw new TypeError('sourceUrl must be a valid HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new TypeError('sourceUrl must be an HTTP(S) URL without embedded credentials');
  }
  return url.toString();
}

function stablePayload(entry) {
  return JSON.stringify({
    schema: entry.schema,
    sequence: entry.sequence,
    previousHash: entry.previousHash,
    event: entry.event
  });
}

function digest(entry) {
  return crypto.createHash('sha256').update(stablePayload(entry), 'utf8').digest('hex');
}

function normalizeEvent(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('event must be an object');
  const event = {
    taskId: bounded(input.taskId, 'taskId', 128),
    kind: bounded(input.kind, 'kind', 80),
    summary: bounded(input.summary, 'summary', 4000),
    sourceUrl: normalizeSourceUrl(input.sourceUrl),
    actor: bounded(input.actor == null ? 'system' : input.actor, 'actor', 128),
    observedAt: input.observedAt == null ? new Date().toISOString() : bounded(input.observedAt, 'observedAt', 64),
    artifactSha256: input.artifactSha256 == null ? null : bounded(input.artifactSha256, 'artifactSha256', 64)
  };
  if (event.artifactSha256 !== null && !HASH_RE.test(event.artifactSha256)) {
    throw new TypeError('artifactSha256 must be a lowercase SHA-256 hex digest');
  }
  if (Number.isNaN(Date.parse(event.observedAt))) throw new TypeError('observedAt must be a parseable timestamp');
  return event;
}

function verifyLedger(ledgerPath) {
  if (typeof ledgerPath !== 'string' || !ledgerPath.trim()) throw new TypeError('ledgerPath must be a non-empty path');
  if (!fs.existsSync(ledgerPath)) return { ok: true, count: 0, headHash: ZERO_HASH };
  const lines = fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/).filter(Boolean);
  let previousHash = ZERO_HASH;
  for (let index = 0; index < lines.length; index++) {
    let entry;
    try { entry = JSON.parse(lines[index]); }
    catch { throw new Error('Invalid JSON in evidence ledger at line ' + (index + 1)); }
    if (!entry || entry.schema !== SCHEMA) throw new Error('Unsupported evidence ledger schema at line ' + (index + 1));
    if (entry.sequence !== index + 1) throw new Error('Invalid sequence at line ' + (index + 1));
    if (entry.previousHash !== previousHash) throw new Error('Broken previousHash chain at line ' + (index + 1));
    if (!entry.event || typeof entry.event !== 'object' || Array.isArray(entry.event)) throw new Error('Invalid event at line ' + (index + 1));
    const normalized = normalizeEvent(entry.event);
    if (JSON.stringify(normalized) !== JSON.stringify(entry.event)) throw new Error('Non-canonical event at line ' + (index + 1));
    const expected = digest(entry);
    if (entry.entryHash !== expected) throw new Error('Hash mismatch at line ' + (index + 1));
    previousHash = entry.entryHash;
  }
  return { ok: true, count: lines.length, headHash: previousHash };
}

function appendEvidence(ledgerPath, input) {
  if (typeof ledgerPath !== 'string' || !ledgerPath.trim()) throw new TypeError('ledgerPath must be a non-empty path');
  const prior = verifyLedger(ledgerPath);
  const event = normalizeEvent(input);
  const entry = {
    schema: SCHEMA,
    sequence: prior.count + 1,
    previousHash: prior.headHash,
    event
  };
  entry.entryHash = digest(entry);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'a' });
  return { ...entry, verification: { ok: true, count: entry.sequence, headHash: entry.entryHash } };
}

module.exports = { SCHEMA, ZERO_HASH, appendEvidence, verifyLedger, normalizeEvent };
