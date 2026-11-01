'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SCHEMA, normalizeScope, validateScanRequest, createScopeDigest } = require('./scope-policy.cjs');

function fixture(overrides = {}) {
  return {
    schema: SCHEMA,
    scopeId: 'lab-2026-001',
    owner: 'authorized-lab-owner',
    authorizedBy: 'human-operator',
    authorizationRef: 'approval-record-001',
    authorizedAt: '2026-11-01T00:00:00.000Z',
    expiresAt: '2026-11-02T00:00:00.000Z',
    targets: ['example.org', '192.0.2.10'],
    allowedChecks: ['dns_records', 'tls_certificate', 'http_security_headers'],
    ...overrides
  };
}

test('normalizes exact authorized targets and computes stable scope digest', () => {
  const scope = fixture();
  assert.deepEqual(normalizeScope(scope).targets, ['example.org', '192.0.2.10']);
  assert.equal(createScopeDigest(scope), createScopeDigest(scope));
});

test('requires explicit human approval before accepting a scan request', () => {
  assert.throws(() => validateScanRequest({
    scope: fixture(), target: 'example.org', check: 'dns_records',
    approved: false, now: '2026-11-01T01:00:00.000Z'
  }), /human_approval_required/);
});

test('accepts only exact targets and explicitly allowed check types', () => {
  const result = validateScanRequest({
    scope: fixture(), target: 'EXAMPLE.ORG', check: 'dns_records',
    approved: true, now: '2026-11-01T01:00:00.000Z'
  });
  assert.equal(result.ok, true);
  assert.equal(result.target, 'example.org');
  assert.throws(() => validateScanRequest({
    scope: fixture(), target: 'sub.example.org', check: 'dns_records',
    approved: true, now: '2026-11-01T01:00:00.000Z'
  }), /target_out_of_scope/);
  assert.throws(() => validateScanRequest({
    scope: fixture(), target: 'example.org', check: 'port_scan',
    approved: true, now: '2026-11-01T01:00:00.000Z'
  }), /check_not_authorized/);
});

test('rejects wildcard, URL, CIDR, and malformed targets', () => {
  for (const target of ['*.example.org', 'https://example.org', '192.0.2.0/24', 'bad host']) {
    assert.throws(() => normalizeScope(fixture({ targets: [target] })));
  }
});

test('rejects expired, not-yet-valid, and inverted authorization windows', () => {
  assert.throws(() => validateScanRequest({
    scope: fixture(), target: 'example.org', check: 'dns_records',
    approved: true, now: '2026-11-02T00:00:00.000Z'
  }), /scope_not_current/);
  assert.throws(() => validateScanRequest({
    scope: fixture(), target: 'example.org', check: 'dns_records',
    approved: true, now: '2026-10-31T23:59:59.000Z'
  }), /scope_not_current/);
  assert.throws(() => normalizeScope(fixture({
    authorizedAt: '2026-11-02T00:00:00.000Z',
    expiresAt: '2026-11-01T00:00:00.000Z'
  })), /scope_time_window_invalid/);
});

test('rejects unsupported check types and duplicate targets', () => {
  assert.throws(() => normalizeScope(fixture({ allowedChecks: ['exploit_execution'] })), /scope_check_not_allowed/);
  assert.throws(() => normalizeScope(fixture({ targets: ['example.org', 'EXAMPLE.ORG'] })), /scope_targets_duplicate/);
});
