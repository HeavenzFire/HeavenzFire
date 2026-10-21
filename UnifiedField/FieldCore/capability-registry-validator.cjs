'use strict';

const STATUSES = new Set([
  'available',
  'degraded',
  'quota_exhausted',
  'unauthorized',
  'disabled',
  'unknown'
]);

const SECRET_KEY = /(?:^|[_-])(api[_-]?key|access[_-]?token|refresh[_-]?token|auth(?:orization)?|password|passwd|secret|credential|private[_-]?key|client[_-]?secret)(?:$|[_-])/i;
const SECRET_VALUE = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]+=*|\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b)/i;

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(label + ' must be an object');
  }
}

function hasSecret(value, path = '$') {
  if (Array.isArray(value)) {
    return value.some((item, index) => hasSecret(item, path + '[' + index + ']'));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, child]) =>
      SECRET_KEY.test(key) || hasSecret(child, path + '.' + key)
    );
  }
  return typeof value === 'string' && SECRET_VALUE.test(value);
}

function parseTimestamp(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(field + ' must be an ISO timestamp string or null');
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new TypeError(field + ' must be a valid timestamp');
  return timestamp;
}

function validateCapabilityRecord(record, { now = Date.now(), maxAgeMs = 5 * 60 * 1000 } = {}) {
  assertObject(record, 'capability record');
  if (hasSecret(record)) throw new Error('secret-bearing capability records are forbidden');
  for (const field of ['id', 'provider']) {
    if (typeof record[field] !== 'string' || !record[field].trim()) {
      throw new TypeError(field + ' must be a non-empty string');
    }
  }
  if (!STATUSES.has(record.status)) throw new Error('unsupported capability status');
  if (record.checkedAt !== null) parseTimestamp(record.checkedAt, 'checkedAt');
  if (!Array.isArray(record.evidence)) throw new TypeError('evidence must be an array');
  if (!Array.isArray(record.limits)) throw new TypeError('limits must be an array');
  if (record.localFallback !== null && typeof record.localFallback !== 'string') {
    throw new TypeError('localFallback must be a string or null');
  }
  if (typeof record.requiresApproval !== 'boolean') {
    throw new TypeError('requiresApproval must be a boolean');
  }
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
    throw new TypeError('now and maxAgeMs must be finite numbers; maxAgeMs must be non-negative');
  }
  if (record.status === 'available') {
    if (record.checkedAt === null) throw new Error('available status requires checkedAt evidence');
    const checkedAt = parseTimestamp(record.checkedAt, 'checkedAt');
    if (checkedAt > now) throw new Error('checkedAt cannot be in the future');
  }
  return true;
}

function isCapabilityAvailable(record, { now = Date.now(), maxAgeMs = 5 * 60 * 1000 } = {}) {
  try {
    validateCapabilityRecord(record, { now, maxAgeMs });
    if (record.status !== 'available' || record.checkedAt === null) return false;
    const checkedAt = Date.parse(record.checkedAt);
    return checkedAt <= now && now - checkedAt <= maxAgeMs;
  } catch {
    return false;
  }
}

module.exports = { STATUSES, validateCapabilityRecord, isCapabilityAvailable };
