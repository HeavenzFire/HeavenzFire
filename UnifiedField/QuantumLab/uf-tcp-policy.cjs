'use strict';

/**
 * Unified Field Ternary Consensus (UF-TCP) policy engine.
 * Pure and deterministic: no network, filesystem, clock, randomness, or model calls.
 *
 * Decision values: +1 accept, 0 abstain/insufficient evidence, -1 reject.
 * The evaluator validates the structure of independence attestations; it cannot
 * prove real-world process isolation or truthfulness without external attestation.
 */
const DECISION = Object.freeze({ ACCEPT: 1, ABSTAIN: 0, REJECT: -1 });
const REQUIRED_VERIFIERS = 2;
const REQUIRED_GATES = Object.freeze([
  'tests_pass',
  'security_review_pass',
  'evidence_complete',
  'reproducible',
  'fresh'
]);

function result(decision, code, reasons, input) {
  return Object.freeze({
    policy: 'UF-TCP/0.2',
    decision,
    label: decision === 1 ? 'ACCEPT' : decision === -1 ? 'REJECT' : 'ABSTAIN',
    code,
    reasons: Object.freeze(reasons.slice()),
    evidence_sha256: typeof input.evidence_sha256 === 'string' ? input.evidence_sha256 : null,
    verifier_count: Array.isArray(input.verifiers) ? input.verifiers.length : 0
  });
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function evaluate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return result(0, 'INVALID_INPUT', ['Input must be an object; no approval granted.'], {});
  }

  const counterexamples = input.counterexamples === undefined ? [] : input.counterexamples;
  if (!Array.isArray(counterexamples)) {
    return result(0, 'COUNTEREXAMPLES_INVALID', ['Counterexample evidence must be an array.'], input);
  }
  if (counterexamples.some(x => x && x.status === 'reproduced')) {
    return result(-1, 'REPRODUCIBLE_COUNTEREXAMPLE',
      counterexamples.filter(x => x && x.status === 'reproduced').map(x => 'Reproducible counterexample: ' + String(x.id || 'unnamed')), input);
  }
  if (counterexamples.some(x => !x || !['unresolved', 'refuted'].includes(x.status))) {
    return result(0, 'COUNTEREXAMPLE_STATUS_UNKNOWN', ['A counterexample is malformed or unresolved.'], input);
  }

  const mandatory = Array.isArray(input.mandatory_invariants) ? input.mandatory_invariants : [];
  if (mandatory.length === 0) {
    return result(0, 'MANDATORY_INVARIANTS_MISSING', ['At least one mandatory invariant must be declared.'], input);
  }
  const failed = mandatory.filter(x => x && x.status === 'fail');
  if (failed.length) {
    return result(-1, 'MANDATORY_INVARIANT_FAILED',
      failed.map(x => 'Mandatory invariant failed: ' + String(x.id || 'unnamed')), input);
  }
  const unknownMandatory = mandatory.filter(x => !x || x.status !== 'pass');
  if (unknownMandatory.length) {
    return result(0, 'MANDATORY_INVARIANT_UNKNOWN',
      ['At least one mandatory invariant is missing, malformed, or not passed.'], input);
  }

  const gates = input.gates;
  if (!gates || typeof gates !== 'object' || Array.isArray(gates)) {
    return result(0, 'GATES_MISSING', ['Required gates are missing.'], input);
  }
  const failedGates = REQUIRED_GATES.filter(key => gates[key] === false);
  if (failedGates.length) {
    return result(-1, 'REQUIRED_GATE_FAILED', failedGates.map(k => 'Required gate failed: ' + k), input);
  }
  const unknownGates = REQUIRED_GATES.filter(key => gates[key] !== true);
  if (unknownGates.length) {
    return result(0, 'REQUIRED_GATE_UNKNOWN', unknownGates.map(k => 'Required gate not verified: ' + k), input);
  }

  const sha = input.evidence_sha256;
  if (typeof sha !== 'string' || !/^[a-f0-9]{64}$/i.test(sha)) {
    return result(0, 'EVIDENCE_HASH_INVALID', ['A 64-character SHA-256 evidence digest is required.'], input);
  }
  if (!nonBlank(input.proposer_id)) {
    return result(0, 'PROPOSER_ID_MISSING', ['A proposer identity is required to prevent self-verification.'], input);
  }

  const verifiers = input.verifiers;
  if (!Array.isArray(verifiers)) {
    return result(0, 'VERIFIERS_MISSING', ['Two independent, inspectable verifier records are required.'], input);
  }
  if (verifiers.some(v => v && v.decision === -1)) {
    return result(0, 'VERIFIER_DISAGREEMENT',
      ['A verifier rejected the claim; record and resolve the challenge with discriminating evidence.'], input);
  }

  const usable = verifiers.filter(v =>
    v && typeof v === 'object' &&
    nonBlank(v.id) &&
    nonBlank(v.identity) &&
    nonBlank(v.execution_id) &&
    nonBlank(v.isolation_id) &&
    v.identity.trim() !== input.proposer_id.trim() &&
    v.independent === true &&
    v.evidence_sha256 === sha &&
    v.decision === 1 &&
    nonBlank(v.rationale)
  );

  const unique = field => new Set(usable.map(v => v[field].trim())).size;
  if (unique('id') < REQUIRED_VERIFIERS ||
      unique('identity') < REQUIRED_VERIFIERS ||
      unique('execution_id') < REQUIRED_VERIFIERS ||
      unique('isolation_id') < REQUIRED_VERIFIERS) {
    return result(0, 'VERIFICATION_INSUFFICIENT',
      ['Two distinct verifier identities, executions, and isolation contexts bound to the same evidence digest are required.'], input);
  }

  return result(1, 'ALL_GATES_PASSED',
    ['All mandatory invariants, gates, and structurally distinct verifier attestations passed.'], input);
}

module.exports = { DECISION, REQUIRED_GATES, evaluate };
