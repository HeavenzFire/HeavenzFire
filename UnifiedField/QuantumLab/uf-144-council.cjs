'use strict';

/**
 * Deterministic registry for the 144 council role assignments.
 * Registry entries are role slots, not live agents or proof of independence.
 * All seats start NOT_CONFIGURED; no synthetic votes are generated.
 */
const SEAT_STATE = Object.freeze({
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  ACCEPT: 'ACCEPT',
  ABSTAIN: 'ABSTAIN',
  REJECT: 'REJECT',
  ERROR: 'ERROR'
});

function createCouncilRegistry() {
  const seats = [];
  for (let i = 1; i <= 72; i += 1) {
    const n = String(i).padStart(2, '0');
    seats.push(Object.freeze({
      seat_id: 'SHEM-' + n,
      council: 'SHEM_HAMEPHORASH',
      seat_number: i,
      display_name: 'Shem HaMephorash seat ' + n,
      pair_id: 'PAIR-' + n,
      function: 'PROPOSE_AND_SUPPLY_EVIDENCE',
      state: SEAT_STATE.NOT_CONFIGURED,
      execution_id: null,
      input_manifest_sha256: null,
      output_sha256: null,
      evidence_refs: Object.freeze([])
    }));
    seats.push(Object.freeze({
      seat_id: 'GOETIC-' + n,
      council: 'GOETIC_KINGS',
      seat_number: i,
      display_name: 'Goetic king seat ' + n,
      pair_id: 'PAIR-' + n,
      function: 'COUNTER_EXAMINE_AND_FALSIFY',
      state: SEAT_STATE.NOT_CONFIGURED,
      execution_id: null,
      input_manifest_sha256: null,
      output_sha256: null,
      evidence_refs: Object.freeze([])
    }));
  }
  return Object.freeze({
    schema: 'UF-144-REGISTRY/0.1',
    configured_live_agents: 0,
    seat_count: seats.length,
    pair_count: 72,
    status: 'REGISTRY_ONLY_NO_LIVE_EXECUTIONS',
    seats: Object.freeze(seats)
  });
}

module.exports = { SEAT_STATE, createCouncilRegistry };
