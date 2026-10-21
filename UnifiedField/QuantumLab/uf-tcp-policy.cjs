'use strict';

/**
 * Unified Field Ternary Consensus (UF-TCP) policy engine.
 * Pure and deterministic: no network, filesystem, clock, randomness, or model calls.
 *
 * Decision values: +1 accept, 0 abstain/insufficient evidence, -1 reject.
 * This policy evaluates supplied evidence; it does not establish that reviewers
 * are independent or that external claims are true.
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
    policy: 'UF-TCP/0.1',
    decision,
    label: decision === 1 ? 'ACCEPT' : decision === -1 ? 'REJECT' : 'ABSTAIN',
    code,
    reasons: Object.freeze(reasons.slice()),
    evidence_sha256: typeof input.evidence_sha256 === 'string' ? input.evidence_sha256 : null,
    verifier_count: Array.isArray(input.verifiers) ? input.verifiers.length : 0
  });
}

function evaluate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return result(0, 'INVALID_INPUT', ['Input must be an object; no approval granted.'], {});
  }

  const mandatory = Array.isArray(input.mandatory_invariants) ? input.mandatory_invariants : [];
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

  const verifiers = input.verifiers;
  if (!Array.isArray(verifiers)) {
    return result(0, 'VERIFIERS_MISSING', ['Two independent, inspectable verifier records are required.'], input);
  }

  const usable = verifiers.filter(v =>
    v && typeof v === 'object' &&
    typeof v.id === 'string' && v.id.trim().length > 0 &&
    v.independent === true &&
    v.evidence_sha256 === sha &&
    v.decision === 1 &&
    typeof v.rationale === 'string' && v.rationale.trim().length > 0
  );

  const uniqueIds = new Set(usable.map(v => v.id.trim()));
  if (uniqueIds.size < REQUIRED_VERIFIERS) {
    const rejected = verifiers.some(v => v && v.decision === -1);
    if (rejected) {
      return result(-1, 'VERIFIER_REJECTED', ['A verifier rejected the proposal; resolve the challenge before approval.'], input);
    }
    return result(0, 'VERIFICATION_INSUFFICIENT',
      ['Fewer than two unique verifier records satisfy the evidence and independence contract.'], input);
  }

  if (verifiers.some(v => v && v.decision === -1)) {
    return result(0, 'VERIFIER_DISAGREEMENT',
      ['Verifier disagreement requires a recorded challenge and discriminating test.'], input);
  }

  return result(1, 'ALL_GATES_PASSED',
    ['All mandatory invariants and required gates passed.'],
    input);
}

module.exports = { DECISION, REQUIRED_GATES, evaluate };
