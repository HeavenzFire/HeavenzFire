'use strict';

const crypto = require('node:crypto');

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function validateBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('invalid_hub_url', 'A valid PeerLink hub URL is required'); }
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname.toLowerCase());
  if ((!loopback && url.protocol !== 'https:') ||
      (loopback && !['http:', 'https:'].includes(url.protocol)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    fail('https_required', 'PeerLink requires HTTPS except for loopback development');
  }
  return url;
}

function createPeerLinkAgent(options = {}) {
  const base = validateBaseUrl(options.hubUrl || process.env.HF_PEERLINK_HUB_URL || '');
  const token = options.token || process.env.HF_PEERLINK_TOKEN;
  const peerId = options.peerId || process.env.HF_PEERLINK_PEER_ID || 'heavenzfire-arm64';
  const inferenceUrl = options.inferenceUrl || process.env.HF_PEERLINK_INFERENCE_URL || 'http://127.0.0.1:11800';
  let inferenceBase;
  try { inferenceBase = new URL(inferenceUrl); } catch { fail('invalid_inference_url', 'A valid local inference URL is required'); }
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(inferenceBase.hostname.toLowerCase()) ||
      !['http:', 'https:'].includes(inferenceBase.protocol) || inferenceBase.username || inferenceBase.password ||
      inferenceBase.search || inferenceBase.hash) {
    fail('inference_loopback_only', 'Inference endpoint must be a credential-free loopback URL');
  }
  const model = options.model || process.env.HF_PEERLINK_MODEL || 'heavenzfire-qwen-0.5b';
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs || 90000), 120000));
  if (typeof token !== 'string' || token.length < 32) fail('token_required', 'HF_PEERLINK_TOKEN must contain at least 32 characters');
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(peerId)) fail('invalid_peer_id', 'peer ID contains unsupported characters');
  if (typeof fetchImpl !== 'function') fail('fetch_unavailable', 'fetch is required');

  let sessionToken = null;
  let connected = false;
  let stopping = false;

  async function request(route, body, authToken, timeout = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetchImpl(new URL(route, base), {
        method: 'POST',
        headers: { authorization: 'Bearer ' + authToken, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true) fail('hub_rejected', 'PeerLink hub rejected ' + route + ' with HTTP ' + response.status);
      return data;
    } catch (error) {
      if (controller.signal.aborted) fail('request_timeout', 'PeerLink request timed out');
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function infer(task) {
    if (!task || task.type !== 'inference.chat' || !task.payload) fail('unsupported_task', 'Agent only accepts inference.chat tasks');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL('/v1/chat/completions', inferenceBase), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: task.payload.model || model,
          messages: task.payload.messages,
          stream: false,
          max_tokens: task.payload.max_tokens,
          temperature: task.payload.temperature
        }),
        redirect: 'error',
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) fail('inference_http_error', 'Inference runtime returned HTTP ' + response.status);
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) fail('empty_inference_result', 'Inference runtime returned no assistant text');
      return { model: data.model || task.payload.model || model, response: content, usage: data.usage || null };
    } catch (error) {
      if (controller.signal.aborted) fail('inference_timeout', 'Inference runtime timed out');
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function connect() {
    const nonce = crypto.randomBytes(24).toString('base64url');
    const result = await request('/v1/peers/register', {
      protocol_version: 1, peer_id: peerId, client_nonce: nonce,
      capabilities: ['inference.chat']
    }, token);
    if (result.protocol_version !== 1 || result.peer_id !== peerId || result.client_nonce !== nonce ||
        typeof result.server_nonce !== 'string' || result.server_nonce.length < 22 ||
        typeof result.session_token !== 'string' || result.session_token.length < 32) {
      fail('handshake_verification_failed', 'PeerLink registration response did not satisfy the v1 handshake');
    }
    sessionToken = result.session_token;
    connected = true;
    return { peer_id: peerId, protocol_version: 1, capabilities: ['inference.chat'] };
  }

  async function runOnce() {
    if (!connected || !sessionToken) fail('not_connected', 'Connect before polling for tasks');
    const claim = await request('/v1/peers/poll', { peer_id: peerId }, sessionToken, 10000);
    if (!claim.task) return { status: 'IDLE' };
    const heartbeat = setInterval(() => {
      request('/v1/peers/heartbeat', { peer_id: peerId }, sessionToken, 5000).catch(() => {});
    }, 10000);
    try {
      const result = await infer(claim.task);
      const saved = await request('/v1/peers/result', {
        peer_id: peerId, task_id: claim.task.task_id, ok: true, result
      }, sessionToken);
      return { status: saved.status, task_id: claim.task.task_id };
    } catch (error) {
      await request('/v1/peers/result', {
        peer_id: peerId, task_id: claim.task.task_id, ok: false,
        error: String(error.code || error.message || 'worker_failed').slice(0, 300)
      }, sessionToken);
      return { status: 'FAILED', task_id: claim.task.task_id, error: error.code || 'worker_failed' };
    } finally {
      clearInterval(heartbeat);
    }
  }

  async function run(options = {}) {
    const intervalMs = Math.max(250, Math.min(Number(options.intervalMs || 1000), 10000));
    if (!connected) await connect();
    stopping = false;
    while (!stopping) {
      try { await runOnce(); }
      catch (error) {
        connected = false;
        sessionToken = null;
        if (stopping) break;
        await new Promise(resolve => setTimeout(resolve, intervalMs));
        try { await connect(); } catch {}
      }
      if (!stopping) await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  return Object.freeze({
    connect, runOnce, run,
    stop() { stopping = true; },
    get connected() { return connected; },
    get peerId() { return peerId; }
  });
}

module.exports = { createPeerLinkAgent, validateBaseUrl };
