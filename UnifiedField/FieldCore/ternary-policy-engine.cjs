'use strict';

// Pure, deterministic policy evaluation. This module does not execute tasks,
// inspect the clock, perform network I/O, or infer approval from provider status.
const SCHEMA = 'heavenzfire.ternary-decision.v1';
const DECISIONS = Object.freeze({ DENY: -1, ABSTAIN: 0, ALLOW: 1 });
const EVIDENCE_STATES = new Set(['verified', 'incomplete', 'not_run', 'failed']);
const APPROVAL_STATES = new Set(['approved', 'pending', 'rejected', 'not_required']);

function result(decision, action, reasons) {
  return Object.freeze({
    schema: SCHEMA,
    decision,
    label: decision === 1 ? 'allow' : decision === -1 ? 'deny' : 'abstain',
    action: typeof action === 'string' ? action : null,
    reasons: Object.freeze([...new Set(reasons)].sort())
  });
}

function evaluatePolicy(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return result(DECISIONS.DENY, null, ['invalid_input']);
  }

  const { action, policy, evidence, approval = { status: 'not_required' }, taskId = null } = input;
  if (typeof action !== 'string' || !action.trim()) {
    return result(DECISIONS.DENY, null, ['invalid_action']);
  }
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)
      || !Array.isArray(policy.allowActions) || !Array.isArray(policy.denyActions)
      || typeof policy.requireApproval !== 'boolean') {
    return result(DECISIONS.DENY, action, ['invalid_policy']);
  }
  if (policy.allowActions.some(value => typeof value !== 'string')
      || policy.denyActions.some(value => typeof value !== 'string')) {
    return result(DECISIONS.DENY, action, ['invalid_policy_action_list']);
  }
  if (policy.denyActions.includes(action)) {
    return result(DECISIONS.DENY, action, ['policy_explicit_deny']);
  }
  if (!policy.allowActions.includes(action)) {
    return result(DECISIONS.DENY, action, ['action_not_allowlisted']);
  }

  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)
      || !EVIDENCE_STATES.has(evidence.status)
      || !Array.isArray(evidence.refs)
      || evidence.refs.some(ref => typeof ref !== 'string' || !ref.trim())) {
    return result(DECISIONS.ABSTAIN, action, ['evidence_missing_or_malformed']);
  }
  if (evidence.status === 'failed') {
    return result(DECISIONS.DENY, action, ['evidence_failed']);
  }
  if (evidence.status !== 'verified' || evidence.refs.length === 0) {
    return result(DECISIONS.ABSTAIN, action, [
      evidence.status === 'not_run' ? 'evidence_not_run' : 'evidence_incomplete'
    ]);
  }

  if (!approval || typeof approval !== 'object' || Array.isArray(approval)
      || !APPROVAL_STATES.has(approval.status)) {
    return result(DECISIONS.ABSTAIN, action, ['approval_missing_or_malformed']);
  }
  if (approval.status === 'rejected') {
    return result(DECISIONS.DENY, action, ['approval_rejected']);
  }
  if (policy.requireApproval) {
    if (approval.status !== 'approved') {
      return result(DECISIONS.ABSTAIN, action, ['approval_pending']);
    }
    if (approval.action !== action || typeof taskId !== 'string' || !taskId
        || approval.taskId !== taskId) {
      return result(DECISIONS.DENY, action, ['approval_scope_mismatch']);
    }
  } else if (approval.status === 'approved'
      && (approval.action !== action || (approval.taskId && approval.taskId !== taskId))) {
    return result(DECISIONS.DENY, action, ['approval_scope_mismatch']);
  }

  return result(DECISIONS.ALLOW, action, ['policy_allowlisted', 'evidence_verified']);
}

module.exports = { SCHEMA, DECISIONS, evaluatePolicy };
