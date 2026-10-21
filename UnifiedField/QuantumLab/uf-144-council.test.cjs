'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCouncilRegistry, SEAT_STATE } = require('./uf-144-council.cjs');

test('registry creates exactly 144 explicitly unconfigured role slots', () => {
  const registry = createCouncilRegistry();
  assert.equal(registry.seat_count, 144);
  assert.equal(registry.configured_live_agents, 0);
  assert.equal(registry.seats.length, 144);
  assert.ok(registry.seats.every(s => s.state === SEAT_STATE.NOT_CONFIGURED));
  assert.ok(registry.seats.every(s => s.execution_id === null));
});

test('72 proposal roles are paired one-to-one with 72 challenge roles', () => {
  const registry = createCouncilRegistry();
  const proposal = registry.seats.filter(s => s.council === 'SHEM_HAMEPHORASH');
  const challenge = registry.seats.filter(s => s.council === 'GOETIC_KINGS');
  assert.equal(proposal.length, 72);
  assert.equal(challenge.length, 72);
  for (let i = 1; i <= 72; i += 1) {
    const n = String(i).padStart(2, '0');
    const a = proposal.find(s => s.seat_id === 'SHEM-' + n);
    const b = challenge.find(s => s.seat_id === 'GOETIC-' + n);
    assert.ok(a && b);
    assert.equal(a.pair_id, b.pair_id);
    assert.notEqual(a.function, b.function);
  }
});

test('registry output is deterministic and does not fabricate votes', () => {
  const a = createCouncilRegistry();
  const b = createCouncilRegistry();
  assert.deepEqual(a, b);
  assert.ok(a.seats.every(s => s.evidence_refs.length === 0));
  assert.ok(a.seats.every(s => s.output_sha256 === null));
});
