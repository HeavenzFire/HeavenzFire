'use strict';

const crypto = require('node:crypto');

const SCHEMA = 'heavenzfire.sentinel.scope.v1';
const ALLOWED_CHECKS = new Set([
  'dns_records',
  'tls_certificate',
  'http_security_headers',
  'http_metadata'
]);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HOST_RE = /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const IPV4_RE = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function boundedString(value, field, max = 256) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new TypeError(field + '_invalid');
  }
  return value.trim();
}

function normalizeTarget(value) {
  const target = boundedString(value, 'target', 253).toLowerCase().replace(/\.$/, '');
  if (target.includes('*') || target.includes('/') || target.includes('@') || target.includes(':')) {
    throw new Error('target_must_be_exact_hostname_or_ipv4');
  }
  if (!HOST_RE.test(target) && !IPV4_RE.test(target)) {
    throw new Error('target_invalid');
  }
  return target;
}

function normalizeScope(scope) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) throw new TypeError('scope_required');
  if (scope.schema !== SCHEMA) throw new Error('scope_schema_invalid');
  const scopeId = boundedString(scope.scopeId, 'scopeId', 128);
  if (!ID_RE.test(scopeId)) throw new Error('scopeId_invalid');
  const owner = boundedString(scope.owner, 'owner', 256);
  const authorizedBy = boundedString(scope.authorizedBy, 'authorizedBy', 256);
  const authorizationRef = boundedString(scope.authorizationRef, 'authorizationRef', 512);
  const authorizedAt = boundedString(scope.authorizedAt, 'authorizedAt', 64);
  const expiresAt = boundedString(scope.expiresAt, 'expiresAt', 64);
  const start = Date.parse(authorizedAt);
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('scope_time_window_invalid');
  if (!Array.isArray(scope.targets) || scope.targets.length < 1 || scope.targets.length > 100) {
    throw new Error('scope_targets_invalid');
  }
  const targets = scope.targets.map(normalizeTarget);
  if (new Set(targets).size !== targets.length) throw new Error('scope_targets_duplicate');
  if (!Array.isArray(scope.allowedChecks) || scope.allowedChecks.length < 1) throw new Error('scope_checks_invalid');
  const allowedChecks = scope.allowedChecks.map(check => boundedString(check, 'check', 80));
  if (new Set(allowedChecks).size !== allowedChecks.length) throw new Error('scope_checks_duplicate');
  for (const check of allowedChecks) {
    if (!ALLOWED_CHECKS.has(check)) throw new Error('scope_check_not_allowed:' + check);
  }
  return Object.freeze({
    schema: SCHEMA, scopeId, owner, authorizedBy, authorizationRef,
    authorizedAt: new Date(start).toISOString(),
    expiresAt: new Date(end).toISOString(),
    targets: Object.freeze(targets),
    allowedChecks: Object.freeze(allowedChecks)
  });
}

function validateScanRequest({ scope, target, check, approved, now = new Date().toISOString() } = {}) {
  if (approved !== true) throw new Error('human_approval_required');
  const normalized = normalizeScope(scope);
  const current = Date.parse(now);
  if (!Number.isFinite(current)) throw new TypeError('now_invalid');
  if (current < Date.parse(normalized.authorizedAt) || current >= Date.parse(normalized.expiresAt)) {
    throw new Error('scope_not_current');
  }
  const host = normalizeTarget(target);
  if (!normalized.targets.includes(host)) throw new Error('target_out_of_scope');
  if (typeof check !== 'string' || !normalized.allowedChecks.includes(check)) {
    throw new Error('check_not_authorized');
  }
  return Object.freeze({
    ok: true,
    scopeId: normalized.scopeId,
    target: host,
    check,
    authorizationRef: normalized.authorizationRef,
    validatedAt: new Date(current).toISOString()
  });
}

function createScopeDigest(scope) {
  const normalized = normalizeScope(scope);
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

module.exports = { SCHEMA, ALLOWED_CHECKS, normalizeTarget, normalizeScope, validateScanRequest, createScopeDigest };
