'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyWorkerHealth } = require('./uf-dashboard-health.cjs');

const healthy = { ok: true, service: 'heavenzfire-unified-field-worker', writable: true };

test('valid worker health with writable journal is healthy', () => {
  assert.equal(classifyWorkerHealth(true, 200, healthy), 'healthy');
});

test('valid worker health with non-writable journal is degraded', () => {
  assert.equal(classifyWorkerHealth(true, 200, { ...healthy, writable: false }), 'degraded');
});

test('HTTP failure remains an HTTP failure', () => {
  assert.equal(classifyWorkerHealth(false, 503, healthy), 'HTTP 503');
});

test('successful HTTP response with wrong service identity is rejected', () => {
  assert.equal(classifyWorkerHealth(true, 200, { ...healthy, service: 'other-service' }), 'invalid health response');
});

test('successful HTTP response with malformed or missing JSON is rejected', () => {
  assert.equal(classifyWorkerHealth(true, 200, null), 'invalid health response');
});
