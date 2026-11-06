'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_TTL_MS = 10 * 60 * 1000;
const NONCE_RE = /^[A-Za-z0-9_-]{32,128}$/;

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function subjectDigest(action, subject) {
  return sha256(canonical({ action, subject }));
}
function approvalPayload({ action, subject, approvedBy, reason, nonce, now = Date.now(), ttlMs = 5 * 60 * 1000 }) {
  if (typeof action !== 'string' || !action.trim()) throw new Error('approval_action_required');
  if (!subject || typeof subject !== 'object' || Array.isArray(subject)) throw new Error('approval_subject_required');
  if (typeof approvedBy !== 'string' || !approvedBy.trim() || approvedBy.length > 128) throw new Error('approval_identity_required');
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 1000) throw new Error('approval_reason_required');
  if (!NONCE_RE.test(nonce || '')) throw new Error('approval_nonce_invalid');
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > MAX_TTL_MS) throw new Error('approval_ttl_invalid');
  return {
    version: 1,
    approvalId: crypto.randomUUID(),
    approvedBy: approvedBy.trim(),
    reason: reason.trim(),
    method: 'ed25519-human-signature',
    verifiedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    nonce,
    action,
    subjectSha256: subjectDigest(action, subject)
  };
}
function signApproval({ privateKey, action, subject, approvedBy, reason, nonce = crypto.randomBytes(32).toString('base64url'), now, ttlMs }) {
  if (!privateKey) throw new Error('approval_private_key_required');
  const payload = approvalPayload({ action, subject, approvedBy, reason, nonce, now, ttlMs });
  const signature = crypto.sign(null, Buffer.from(canonical(payload)), privateKey).toString('base64url');
  return { payload, signature };
}
function createEd25519ApprovalVerifier({ publicKey, stateDir, now = () => Date.now() }) {
  if (!publicKey) throw new Error('approval_public_key_required');
  if (!stateDir) throw new Error('approval_state_dir_required');
  const key = crypto.createPublicKey(publicKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('approval_public_key_must_be_ed25519');
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  return async ({ action, subject, evidence }) => {
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence) ||
        !evidence.payload || typeof evidence.payload !== 'object' ||
        typeof evidence.signature !== 'string' || evidence.signature.length > 2048) {
      throw new Error('approval_envelope_invalid');
    }
    const p = evidence.payload;
    if (p.version !== 1 || p.action !== action || p.subjectSha256 !== subjectDigest(action, subject) ||
        typeof p.approvalId !== 'string' || typeof p.approvedBy !== 'string' ||
        typeof p.reason !== 'string' || typeof p.nonce !== 'string' || !NONCE_RE.test(p.nonce) ||
        p.method !== 'ed25519-human-signature' || !Number.isFinite(Date.parse(p.verifiedAt)) ||
        !Number.isFinite(Date.parse(p.expiresAt))) throw new Error('approval_context_invalid');
    const verifiedAt = Date.parse(p.verifiedAt);
    const expiresAt = Date.parse(p.expiresAt);
    const current = now();
    if (verifiedAt > current + 30000 || expiresAt <= current || expiresAt <= verifiedAt ||
        expiresAt - verifiedAt > MAX_TTL_MS) throw new Error('approval_expired_or_outside_validity_window');
    const signature = Buffer.from(evidence.signature, 'base64url');
    if (!crypto.verify(null, Buffer.from(canonical(p)), key, signature)) throw new Error('approval_signature_invalid');
    const marker = path.join(stateDir, sha256(p.nonce) + '.used');
    let fd;
    try {
      fd = fs.openSync(marker, 'wx', 0o600);
      fs.writeSync(fd, JSON.stringify({ approvalId: p.approvalId, usedAt: new Date(current).toISOString(), action }));
      fs.fsyncSync(fd);
    } catch (error) {
      if (error.code === 'EEXIST') throw new Error('approval_replay_rejected');
      throw error;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    return {
      approved: true, approvalId: p.approvalId, approvedBy: p.approvedBy,
      reason: p.reason, method: p.method, verifiedAt: p.verifiedAt
    };
  };
}
function createApprovalVerifierFromEnv({ serviceId }) {
  if (!process.env.HF_APPROVAL_PUBLIC_KEY_FILE) return null;
  if (typeof serviceId !== 'string' || !/^[a-z0-9-]{1,40}$/.test(serviceId)) throw new Error('approval_service_id_invalid');
  const root = process.env.HF_APPROVAL_STATE_DIR;
  if (!root) throw new Error('HF_APPROVAL_STATE_DIR_required_when_approval_key_is_configured');
  const publicKey = fs.readFileSync(process.env.HF_APPROVAL_PUBLIC_KEY_FILE, 'utf8');
  return createEd25519ApprovalVerifier({ publicKey, stateDir: path.join(root, serviceId) });
}

function generateEd25519KeyPair() {
  return crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
}

module.exports = { createEd25519ApprovalVerifier, createApprovalVerifierFromEnv, signApproval, generateEd25519KeyPair, canonical, subjectDigest, MAX_TTL_MS };
