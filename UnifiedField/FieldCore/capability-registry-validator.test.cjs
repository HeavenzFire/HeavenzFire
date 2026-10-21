'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUSES, validateCapabilityRecord, isCapabilityAvailable } = require('./capability-registry-validator.cjs');

const NOW = Date.parse('2026-10-20T12:00:00.000Z');

function capability(overrides = {}) {
  return {
    id: 'provider.chat.generate',
    provider: 'local-ollama',
    status: 'available',
    checkedAt: '2026-10-20T11:59:00.000Z',
    evidence: [{ kind: 'healthcheck', result: 'HTTP 200' }],
    limits: [],
    localFallback: null,
    requiresApproval: true,
    ...overrides
  };
}

test('accepts each documented status and rejects unknown status strings', () => {
  for (const status of STATUSES) {
    const record = capability({ status, checkedAt: status === 'available' ? capability().checkedAt : null });
    assert.equal(validateCapabilityRecord(record, { now: NOW }), true, status);
  }
  for (const status of ['online', 'ready', 'stale', 'AVAILABLE', '', 0, null]) {
    assert.throws(() => validateCapabilityRecord(capability({ status }), { now: NOW }), /unsupported capability status/);
  }
});

test('only a fresh, explicitly available record is considered available', () => {
  assert.equal(isCapabilityAvailable(capability(), { now: NOW, maxAgeMs: 120000 }), true);
  assert.equal(isCapabilityAvailable(capability({ status: 'unknown', checkedAt: null }), { now: NOW }), false);
  assert.equal(isCapabilityAvailable(capability({ status: 'degraded' }), { now: NOW }), false);
  assert.equal(isCapabilityAvailable(capability({ checkedAt: '2026-10-20T11:50:00.000Z' }), { now: NOW, maxAgeMs: 120000 }), false);
  assert.equal(isCapabilityAvailable(capability({ checkedAt: null }), { now: NOW }), false);
  assert.equal(isCapabilityAvailable(capability({ checkedAt: '2026-10-20T12:01:00.000Z' }), { now: NOW }), false);
  assert.equal(isCapabilityAvailable({ ...capability(), status: 'ready' }, { now: NOW }), false);
});

test('rejects secret-bearing fields at any nested depth', () => {
  for (const secretRecord of [
    capability({ apiKey: 'not-a-real-key' }),
    capability({ metadata: { access_token: 'placeholder' } }),
    capability({ evidence: [{ kind: 'healthcheck', token: 'placeholder' }] }),
    capability({ metadata: { Authorization: 'Bearer abc' } }),
    capability({ evidence: [{ kind: 'note', result: 'sk-1234567890abcdef1234567890' }] })
  ]) {
    assert.throws(() => validateCapabilityRecord(secretRecord, { now: NOW }), /secret-bearing capability records are forbidden/);
    assert.equal(isCapabilityAvailable(secretRecord, { now: NOW }), false);
  }
});

test('rejects malformed required fields and invalid timestamps', () => {
  assert.throws(() => validateCapabilityRecord(capability({ id: ' ' }), { now: NOW }), /id must be a non-empty string/);
  assert.throws(() => validateCapabilityRecord(capability({ provider: '' }), { now: NOW }), /provider must be a non-empty string/);
  assert.throws(() => validateCapabilityRecord(capability({ evidence: {} }), { now: NOW }), /evidence must be an array/);
  assert.throws(() => validateCapabilityRecord(capability({ checkedAt: 'not-a-date' }), { now: NOW }), /checkedAt must be an ISO-8601 timestamp/);
  assert.throws(() => validateCapabilityRecord(capability({ checkedAt: 'October 20, 2026' }), { now: NOW }), /checkedAt must be an ISO-8601 timestamp/);
  assert.throws(() => validateCapabilityRecord(capability({ checkedAt: '2026-10-20' }), { now: NOW }), /checkedAt must be an ISO-8601 timestamp/);
  assert.throws(() => validateCapabilityRecord(capability({ status: 'available', checkedAt: null }), { now: NOW }), /available status requires checkedAt evidence/);
});

test('availability freshness boundary is deterministic', () => {
  const record = capability({ checkedAt: '2026-10-20T11:58:00.000Z' });
  assert.equal(isCapabilityAvailable(record, { now: NOW, maxAgeMs: 120000 }), true);
  assert.equal(isCapabilityAvailable(record, { now: NOW, maxAgeMs: 119999 }), false);
});
