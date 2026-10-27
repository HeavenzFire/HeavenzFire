'use strict';

// Pure client-side validation for the worker's authenticated handshake response.
// This module does not send credentials or open a network connection.
const MODES = new Set(['ONLINE', 'OFFLINE', 'DEGRADED', 'RECONNECTING']);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function verifyHandshakeResponse(payload, expectedClientNonce, expectedProtocolVersion) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fail('invalid_handshake_response', 'Handshake response must be an object.');
  }
  if (payload.ok !== true) {
    return fail('handshake_rejected', 'Worker did not accept the handshake.');
  }
  if (!Number.isSafeInteger(expectedProtocolVersion) || expectedProtocolVersion < 1) {
    return fail('invalid_expected_protocol_version', 'Expected protocol version must be a positive integer.');
  }
  if (payload.protocol_version !== expectedProtocolVersion) {
    return fail('protocol_version_mismatch', 'Worker protocol version does not match the client.');
  }
  if (typeof expectedClientNonce !== 'string' || !/^[A-Za-z0-9_-]{22,128}$/.test(expectedClientNonce)) {
    return fail('invalid_expected_nonce', 'Expected client nonce is malformed.');
  }
  if (payload.client_nonce !== expectedClientNonce) {
    return fail('client_nonce_mismatch', 'Worker response does not echo the current client nonce.');
  }
  if (typeof payload.worker_instance_id !== 'string' || !/^[a-f0-9]{32}$/.test(payload.worker_instance_id)) {
    return fail('invalid_worker_identity', 'Worker identity is malformed.');
  }
  if (!MODES.has(payload.mode)) {
    return fail('invalid_worker_mode', 'Worker mode is not recognized.');
  }
  if (!Array.isArray(payload.capabilities) || payload.capabilities.some(x => typeof x !== 'string' || !x.trim())) {
    return fail('invalid_capabilities', 'Handshake capabilities must be non-empty strings.');
  }
  if (!Array.isArray(payload.limitations) || payload.limitations.some(x => typeof x !== 'string' || !x.trim())) {
    return fail('invalid_limitations', 'Handshake limitations must be non-empty strings.');
  }
  if (!Number.isSafeInteger(payload.nonce_ttl_ms) || payload.nonce_ttl_ms < 1) {
    return fail('invalid_nonce_ttl', 'Handshake nonce TTL must be a positive integer.');
  }

  return Object.freeze({
    protocol_version: payload.protocol_version,
    worker_instance_id: payload.worker_instance_id,
    client_nonce: payload.client_nonce,
    mode: payload.mode,
    capabilities: Object.freeze([...payload.capabilities]),
    limitations: Object.freeze([...payload.limitations]),
    nonce_ttl_ms: payload.nonce_ttl_ms
  });
}

module.exports = { verifyHandshakeResponse };
