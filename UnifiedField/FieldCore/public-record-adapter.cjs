'use strict';

const crypto = require('node:crypto');
const { appendEvidence } = require('./evidence-ledger.cjs');

const MAX_RAW_BYTES = 1024 * 1024;

function text(value, field, max) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(field + ' must be a non-empty string');
  const result = value.trim();
  if (result.length > max) throw new RangeError(field + ' exceeds ' + max + ' characters');
  return result;
}

function validatePublicRecord(record, allowedHosts) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('record must be an object');
  if (!Array.isArray(allowedHosts) || allowedHosts.length === 0) throw new TypeError('allowedHosts must be a non-empty explicit allowlist');
  const sourceName = text(record.sourceName, 'sourceName', 120);
  const recordId = text(record.recordId, 'recordId', 200);
  const title = text(record.title, 'title', 300);
  const summary = text(record.summary, 'summary', 2000);
  const sourceUrl = text(record.sourceUrl, 'sourceUrl', 2000);
  let url;
  try { url = new URL(sourceUrl); } catch { throw new TypeError('sourceUrl must be a valid HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new TypeError('sourceUrl must use HTTPS and contain no embedded credentials');
  }
  const host = url.hostname.toLowerCase();
  const permitted = allowedHosts.some(item => {
    if (typeof item !== 'string' || !item.trim()) return false;
    const allowed = item.trim().toLowerCase().replace(/^\.+|\.+$/g, '');
    return host === allowed || host.endsWith('.' + allowed);
  });
  if (!permitted) throw new Error('sourceUrl host is not in the explicit allowlist');
  const retrievedAt = record.retrievedAt == null ? new Date().toISOString() : text(record.retrievedAt, 'retrievedAt', 64);
  if (Number.isNaN(Date.parse(retrievedAt))) throw new TypeError('retrievedAt must be a parseable timestamp');
  let artifactSha256 = record.artifactSha256 == null ? null : text(record.artifactSha256, 'artifactSha256', 64);
  if (record.rawContent != null) {
    if (typeof record.rawContent !== 'string' && !Buffer.isBuffer(record.rawContent)) throw new TypeError('rawContent must be a string or Buffer');
    const bytes = Buffer.isBuffer(record.rawContent) ? record.rawContent : Buffer.from(record.rawContent, 'utf8');
    if (bytes.length > MAX_RAW_BYTES) throw new RangeError('rawContent exceeds 1 MiB');
    const calculated = crypto.createHash('sha256').update(bytes).digest('hex');
    if (artifactSha256 && artifactSha256 !== calculated) throw new Error('artifactSha256 does not match rawContent');
    artifactSha256 = calculated;
  }
  if (artifactSha256 !== null && !/^[a-f0-9]{64}$/.test(artifactSha256)) {
    throw new TypeError('artifactSha256 must be a lowercase SHA-256 hex digest');
  }
  return {
    sourceName, recordId, title, summary, sourceUrl: url.toString(),
    retrievedAt: new Date(retrievedAt).toISOString(), artifactSha256
  };
}

function ingestPublicRecord({ ledgerPath, record, allowedHosts, actor = 'public-record-adapter' }) {
  if (typeof ledgerPath !== 'string' || !ledgerPath.trim()) throw new TypeError('ledgerPath must be a non-empty path');
  const normalized = validatePublicRecord(record, allowedHosts);
  const evidenceSummary = '[' + normalized.sourceName + '] ' + normalized.recordId + ': ' +
    normalized.title + ' — ' + normalized.summary;
  if (evidenceSummary.length > 4000) throw new RangeError('combined public-record summary exceeds 4000 characters');
  const entry = appendEvidence(ledgerPath, {
    taskId: text(record.taskId, 'taskId', 128),
    kind: 'public_record',
    summary: evidenceSummary,
    sourceUrl: normalized.sourceUrl,
    actor,
    observedAt: normalized.retrievedAt,
    artifactSha256: normalized.artifactSha256
  });
  return { record: normalized, ledgerEntry: entry };
}

module.exports = { MAX_RAW_BYTES, validatePublicRecord, ingestPublicRecord };
