'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { STATUSES, validateCapabilityRecord, isCapabilityAvailable } = require('./capability-registry-validator.cjs');

const registry = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'capability-registry-v1.json'),
  'utf8'
));
const NOW = Date.parse('2026-10-20T12:00:00.000Z');

test('canonical registry statuses and validator statuses cannot drift', () => {
  assert.equal(registry.schema, 'heavenzfire.capability-registry.v1');
  assert.deepEqual([...registry.statuses].sort(), [...STATUSES].sort());
});

test('canonical example record validates but unknown health fails closed', () => {
  assert.equal(validateCapabilityRecord(registry.capability, { now: NOW }), true);
  assert.equal(registry.capability.status, 'unknown');
  assert.equal(isCapabilityAvailable(registry.capability, { now: NOW }), false);
});

test('every registry status validates with status-appropriate evidence', () => {
  for (const status of registry.statuses) {
    const record = {
      ...registry.capability,
      status,
      checkedAt: status === 'available' ? '2026-10-20T11:59:00.000Z' : null
    };
    assert.equal(validateCapabilityRecord(record, { now: NOW }), true, status);
    assert.equal(
      isCapabilityAvailable(record, { now: NOW, maxAgeMs: 120000 }),
      status === 'available',
      status
    );
  }
});

test('registry contract rejects secret fields and unsupported availability claims', () => {
  assert.throws(
    () => validateCapabilityRecord({ ...registry.capability, metadata: { access_token: 'placeholder' } }, { now: NOW }),
    /secret-bearing capability records are forbidden/
  );
  assert.throws(
    () => validateCapabilityRecord({ ...registry.capability, status: 'available', checkedAt: null }, { now: NOW }),
    /available status requires checkedAt evidence/
  );
});
