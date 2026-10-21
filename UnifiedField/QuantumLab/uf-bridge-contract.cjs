'use strict';

// Protocol validation primitives only. This module does not open sockets,
// execute tasks, or establish that a remote adapter is trustworthy.
const PROTOCOL_VERSION = 'UF-BRIDGE/0.1';
const MODES = new Set(['ONLINE', 'OFFLINE', 'DEGRADED', 'RECONNECTING']);

function stringsOnly(value, field) {
  if (!Array.isArray(value) || value.some(x => typeof x !== 'string' || !x.trim())) {
    throw new TypeError(field + ' must be an array of non-empty strings');
  }
  if (new Set(value).size !== value.length) throw new TypeError(field + ' must not contain duplicates');
  return value;
}

function validateHandshake(request, response) {
  if (!request || typeof request !== 'object' || !response || typeof response !== 'object') {
    return { accepted: false, code: 'MALFORMED_HANDSHAKE' };
  }
  if (request.protocol !== PROTOCOL_VERSION || response.protocol !== PROTOCOL_VERSION) {
    return { accepted: false, code: 'PROTOCOL_MISMATCH' };
  }
  if (typeof request.nonce !== 'string' || request.nonce.length < 16 || request.nonce.length > 256) {
    return { accepted: false, code: 'INVALID_REQUEST_NONCE' };
  }
  if (response.nonce !== request.nonce) return { accepted: false, code: 'NONCE_MISMATCH' };
  if (typeof response.adapter_id !== 'string' || !response.adapter_id.trim()) {
    return { accepted: false, code: 'ADAPTER_ID_MISSING' };
  }
  let requestedCapabilities, requestedScopes, capabilities, scopes;
  try {
    requestedCapabilities = stringsOnly(request.capabilities, 'request.capabilities');
    requestedScopes = stringsOnly(request.scopes, 'request.scopes');
    capabilities = stringsOnly(response.capabilities, 'response.capabilities');
    scopes = stringsOnly(response.granted_scopes, 'response.granted_scopes');
  } catch (e) {
    return { accepted: false, code: 'INVALID_CAPABILITY_MANIFEST', reason: e.message };
  }
  const missingCapabilities = requestedCapabilities.filter(x => !capabilities.includes(x));
  const missingScopes = requestedScopes.filter(x => !scopes.includes(x));
  if (missingCapabilities.length || missingScopes.length) {
    return { accepted: false, code: 'CAPABILITY_SCOPE_DENIED', missingCapabilities, missingScopes };
  }
  return {
    accepted: true,
    code: 'HANDSHAKE_CONTRACT_VALID',
    adapter_id: response.adapter_id,
    protocol: PROTOCOL_VERSION,
    capabilities: requestedCapabilities.slice(),
    scopes: requestedScopes.slice(),
    note: 'Contract validated only; transport identity and endpoint reachability require separate verification.'
  };
}

function classifyConnectivity(probes) {
  if (!Array.isArray(probes) || probes.length === 0) return 'DEGRADED';
  if (probes.some(p => !p || typeof p.name !== 'string' || typeof p.reachable !== 'boolean')) return 'DEGRADED';
  const healthy = probes.filter(p => p.reachable).length;
  if (healthy === probes.length) return 'ONLINE';
  if (healthy === 0) return 'OFFLINE';
  return 'DEGRADED';
}

function planReplay(tasks, currentCommitSha, mode) {
  if (!MODES.has(mode)) throw new TypeError('unsupported connectivity mode');
  if (!Array.isArray(tasks)) throw new TypeError('tasks must be an array');
  return tasks.map(task => {
    if (!task || typeof task.task_id !== 'string' || !task.task_id) {
      return { task_id: null, action: 'HOLD', reason: 'INVALID_TASK_RECORD' };
    }
    if (mode === 'OFFLINE' || mode === 'RECONNECTING') {
      return { task_id: task.task_id, action: 'DEFER', reason: mode };
    }
    if (mode === 'DEGRADED') {
      return { task_id: task.task_id, action: 'HOLD', reason: 'CONNECTIVITY_DEGRADED' };
    }
    if (task.status === 'DONE') return { task_id: task.task_id, action: 'SKIP_ALREADY_DONE' };
    if (task.status === 'CONFLICT' || task.status === 'FAILED') {
      return { task_id: task.task_id, action: 'HOLD', reason: task.status };
    }
    if (task.status !== 'QUEUED' && task.status !== 'BLOCKED') {
      return { task_id: task.task_id, action: 'HOLD', reason: 'UNSUPPORTED_TASK_STATE' };
    }
    if (typeof currentCommitSha !== 'string' || !currentCommitSha.trim()) {
      return { task_id: task.task_id, action: 'HOLD', reason: 'CURRENT_REVISION_UNAVAILABLE' };
    }
    if (task.target_commit_sha && task.target_commit_sha !== currentCommitSha) {
      return { task_id: task.task_id, action: 'CONFLICT', reason: 'TARGET_COMMIT_CHANGED' };
    }
    return {
      task_id: task.task_id,
      action: 'ELIGIBLE_FOR_REVALIDATION',
      requiresFreshEvidence: true,
      executionAuthorized: false
    };
  });
}

module.exports = { PROTOCOL_VERSION, validateHandshake, classifyConnectivity, planReplay };
