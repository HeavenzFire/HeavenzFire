'use strict';

const { performLoopbackHandshake, verifyHandshakeResponse } = require('./uf-handshake-client.cjs');

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function normalizeTrustedBaseUrl(baseUrl, allowedHosts) {
  let url;
  try { url = new URL(baseUrl); }
  catch { return fail('invalid_base_url', 'A valid HTTPS base URL is required.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    return fail('https_required', 'Remote transport requires an HTTPS origin with no credentials, path, query, or fragment.');
  }
  if (url.port && url.port !== '443') {
    return fail('nonstandard_port_denied', 'Remote transport only permits the standard HTTPS port.');
  }
  if (url.hostname.endsWith('.ts.net') === false && !allowedHosts?.includes(url.hostname)) {
    return fail('host_not_allowlisted', 'Remote hostname must be an explicit allowlisted host or a Tailscale *.ts.net name.');
  }
  if (!Array.isArray(allowedHosts) || !allowedHosts.includes(url.hostname)) {
    return fail('host_not_allowlisted', 'Remote hostname must exactly match the configured allowlist.');
  }
  return url;
}

function createRemoteTaskClient(options = {}) {
  const { baseUrl, allowedHosts, token, protocolVersion = 1, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = options;
  const base = normalizeTrustedBaseUrl(baseUrl, allowedHosts);
  if (typeof token !== 'string' || token.length < 1) fail('token_required', 'A bearer token is required.');
  if (typeof fetchImpl !== 'function') fail('fetch_unavailable', 'A fetch implementation is required.');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) fail('invalid_timeout', 'Timeout must be between 1 and 30000 milliseconds.');

  let session = null;
  async function request(route, method, body) {
    if (!session) fail('handshake_required', 'Connect with a verified handshake before using the task API.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(new URL(route, base), {
        method,
        headers: {
          authorization: 'Bearer ' + token,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) fail('remote_timeout', 'Remote task API timed out.');
      fail('remote_transport_failed', 'Remote task API transport failed: ' + (error?.message || 'unknown error'));
    } finally {
      clearTimeout(timer);
    }
    if (!response || response.status < 200 || response.status >= 300) {
      fail('remote_http_status', 'Remote task API returned HTTP ' + (response?.status ?? 'unknown') + '.');
    }
    let data;
    try { data = await response.json(); }
    catch { fail('invalid_remote_json', 'Remote task API returned invalid JSON.'); }
    if (!data || data.ok !== true) fail('remote_api_rejected', 'Remote task API did not confirm success.');
    return data;
  }

  return Object.freeze({
    async connect() {
      const clientNonce = require('node:crypto').randomBytes(24).toString('base64url');
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
        if (controller.signal.aborted) fail('remote_timeout', 'Remote handshake timed out.');
        fail('remote_transport_failed', 'Remote handshake transport failed: ' + (error?.message || 'unknown error'));
      } finally {
        clearTimeout(timer);
      }
      if (!response || response.status !== 200) fail('remote_handshake_rejected', 'Remote handshake returned HTTP ' + (response?.status ?? 'unknown') + '.');
      let payload;
      try { payload = await response.json(); }
      catch { fail('invalid_remote_json', 'Remote handshake returned invalid JSON.'); }
      session = verifyHandshakeResponse(payload, clientNonce, protocolVersion);
      return session;
    },
    async listTasks() {
      return (await request('/api/tasks', 'GET')).tasks;
    },
    async submitTask(task) {
      if (!task || typeof task !== 'object' || Array.isArray(task)) fail('invalid_task', 'Task must be an object.');
      const result = await request('/api/tasks', 'POST', { task });
      // The worker journal's enqueue contract returns { accepted, duplicate, task };
      // the materialized task carries the canonical QUEUED state. Preserve support
      // for an explicit status field from compatible worker implementations.
      const status = result.status ?? result.task?.status;
      if (typeof status !== 'string') fail('invalid_task_response', 'Remote task API did not return a task status.');
      return Object.freeze({ status, duplicate: result.duplicate === true, task: result.task });
    },
    getSession() { return session; }
  });
}

module.exports = { createRemoteTaskClient, normalizeTrustedBaseUrl };
