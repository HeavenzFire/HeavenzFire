'use strict';

const crypto = require('node:crypto');

// Pure response validation plus an explicitly loopback-only handshake client.
// Remote transports must use a separately reviewed HTTPS/authentication adapter.
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

async function performLoopbackHandshake(options = {}) {
  const { baseUrl, token, protocolVersion, fetchImpl = globalThis.fetch, timeoutMs = 3000 } = options;
  if (typeof token !== 'string' || token.length < 1) {
    return fail('handshake_token_required', 'A bearer token is required.');
  }
  if (!Number.isSafeInteger(protocolVersion) || protocolVersion < 1) {
    return fail('invalid_expected_protocol_version', 'Protocol version must be a positive integer.');
  }
  if (typeof fetchImpl !== 'function') {
    return fail('fetch_unavailable', 'A fetch implementation is required.');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
    return fail('invalid_timeout', 'Timeout must be between 1 and 30000 milliseconds.');
  }

  let base;
  try { base = new URL(baseUrl); }
  catch { return fail('invalid_base_url', 'A valid loopback base URL is required.'); }
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1' ||
      base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    return fail('loopback_only', 'Handshake client accepts only an http://127.0.0.1[:port]/ base URL.');
  }

  const clientNonce = crypto.randomBytes(24).toString('base64url');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(new URL('/api/handshake', base), {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({ protocol_version: protocolVersion, client_nonce: clientNonce }),
      redirect: 'error',
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) return fail('handshake_timeout', 'Worker handshake timed out.');
    return fail('handshake_transport_failed', 'Worker handshake transport failed: ' + (error?.message || 'unknown error'));
  } finally {
    clearTimeout(timer);
  }

  if (!response || response.status !== 200) {
    return fail('handshake_http_status', 'Worker handshake returned HTTP ' + (response?.status ?? 'unknown') + '.');
  }
  let payload;
  try { payload = await response.json(); }
  catch { return fail('invalid_handshake_json', 'Worker returned invalid handshake JSON.'); }
  return verifyHandshakeResponse(payload, clientNonce, protocolVersion);
}

module.exports = { verifyHandshakeResponse, performLoopbackHandshake };
