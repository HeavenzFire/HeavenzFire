'use strict';

const crypto = require('node:crypto');
const MAX_EVIDENCE_BYTES = 16384;

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function resolveTrustedApproval({ verifier, action, subject, evidence }) {
  if (typeof verifier !== 'function') throw Object.assign(new Error('trusted_approval_verifier_not_configured'), { statusCode: 503 });
  if (typeof action !== 'string' || !action.trim() || !subject || typeof subject !== 'object' || Array.isArray(subject)) {
    throw Object.assign(new Error('trusted_approval_context_invalid'), { statusCode: 500 });
  }
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence) ||
      Buffer.byteLength(JSON.stringify(evidence)) > MAX_EVIDENCE_BYTES) {
    throw Object.assign(new Error('trusted_approval_evidence_required_or_too_large'), { statusCode: 403 });
  }
  let verified;
  try { verified = await verifier({ action, subject, evidence }); }
  catch { throw Object.assign(new Error('trusted_approval_evidence_rejected'), { statusCode: 403 }); }
  const required = ['approvalId', 'approvedBy', 'reason', 'method', 'verifiedAt'];
  if (!verified || verified.approved !== true ||
      required.some(key => typeof verified[key] !== 'string' || !verified[key].trim()) ||
      verified.approvalId.length > 128 || verified.approvedBy.length > 128 ||
      verified.reason.length > 1000 || verified.method.length > 80 ||
      !Number.isFinite(Date.parse(verified.verifiedAt))) {
    throw Object.assign(new Error('trusted_approval_verifier_returned_invalid_evidence'), { statusCode: 403 });
  }
  return Object.freeze({
    approvalId: verified.approvalId.trim(),
    approvedBy: verified.approvedBy.trim(),
    reason: verified.reason.trim(),
    method: verified.method.trim(),
    verifiedAt: new Date(verified.verifiedAt).toISOString(),
    evidenceSha256: digest(evidence),
    subjectSha256: digest({ action, subject })
  });
}

module.exports = { resolveTrustedApproval, MAX_EVIDENCE_BYTES };
