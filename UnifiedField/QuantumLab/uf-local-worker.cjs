'use strict';

// Loopback-only local worker API. HTTP execution is allowlisted and requires a trusted,
// server-configured approval verifier; caller-supplied approval booleans are never trusted.
const http = require('node:http');
const crypto = require('node:crypto');
const { OfflineTaskJournal, MODES } = require('./uf-bridge-journal.cjs');
const { createScopedExecutor } = require('./uf-scoped-executor.cjs');

const MAX_BODY_BYTES = 16 * 1024;
const MAX_EXECUTE_BODY_BYTES = 272 * 1024;
const REMOTE_EXECUTION_ACTIONS = new Set(['workspace.read_file', 'git.status']);
const PROTOCOL_VERSION = 1;
const NONCE_TTL_MS = 2 * 60 * 1000;
const MAX_NONCES = 4096;
function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}
function readJson(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let body = '', size = 0, settled = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        reject(Object.assign(new Error('request body exceeds ' + maxBytes + ' bytes'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      body += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (settled) return;
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(Object.assign(new Error('invalid JSON body'), { statusCode: 400 })); }
    });
    req.on('error', err => { if (!settled) reject(err); });
  });
}
function createWorkerServer(options = {}) {
  const journal = options.journal || new OfflineTaskJournal(options.journalPath);
  const token = options.token || process.env.HEAVENZFIRE_BRIDGE_TOKEN || '';
  let mode = 'OFFLINE';
  const workerInstanceId = crypto.randomBytes(16).toString('hex');
  const seenClientNonces = new Map();
  const executor = options.executor || createScopedExecutor({ workspaceRoot: options.workspaceRoot || process.env.HEAVENZFIRE_WORKSPACE_ROOT });
  // The host must verify an approval bound to requestId/action/input. No verifier means deny.
  const approvalVerifier = options.approvalVerifier;
  const server = http.createServer(async (req, res) => {
    try {
      const requestHost = String(req.headers.host || '').toLowerCase();
      const trustedProxyHost = String(options.trustedProxyHost || process.env.HEAVENZFIRE_TRUSTED_PROXY_HOST || '').toLowerCase();
      const peer = req.socket.remoteAddress || '';
      const peerIsLoopback = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
      const directLoopbackHost = /^127\.0\.0\.1(?::\\d+)?$/.test(requestHost);
      const proxyHostAllowed = Boolean(trustedProxyHost) && requestHost === trustedProxyHost && peerIsLoopback;
      if (req.headers.host && !directLoopbackHost && !proxyHostAllowed) {
        return send(res, 400, { ok: false, error: 'invalid_host' });
      }
      if (req.method === 'OPTIONS') return send(res, 405, { ok: false, error: 'method_not_allowed' });
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/health') {
        const snapshot = journal.inspect();
        return send(res, 200, {
          ok: true,
          service: 'heavenzfire-unified-field-worker',
          bind: '127.0.0.1',
          mode,
          writable: Boolean(token) && snapshot.corruptLines.length === 0,
          journal: { tasks: snapshot.tasks.length, corruptLines: snapshot.corruptLines.length, eventCount: snapshot.eventCount },
          capabilities: ['task-metadata-journal', 'idempotency', 'replay-eligibility-check'],
          limitations: ['no-shell-execution', 'no-arbitrary-shell', 'no-network-sync', 'no-automatic-replay', 'no-live-mesh'],
          execution: {
            ...executor.capabilities(),
            actions: executor.capabilities().actions.filter(action => REMOTE_EXECUTION_ACTIONS.has(action)),
            requires_approval: true,
            approval_verifier_configured: typeof approvalVerifier === 'function',
            write_actions_enabled_over_http: false
          }
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/handshake') {
        if (!token) return send(res, 503, { ok: false, error: 'handshake_token_not_configured' });
        const authorization = req.headers.authorization || '';
        if (!authorization.startsWith('Bearer ') || !safeEqual(authorization.slice(7), token)) {
          return send(res, 401, { ok: false, error: 'unauthorized' });
        }
        const body = await readJson(req, 4096);
        if (body.protocol_version !== PROTOCOL_VERSION) {
          return send(res, 426, { ok: false, error: 'protocol_version_mismatch', supported_protocol_version: PROTOCOL_VERSION });
        }
        const clientNonce = typeof body.client_nonce === 'string' && /^[A-Za-z0-9_-]{22,128}$/.test(body.client_nonce)
          ? body.client_nonce
          : '';
        if (!clientNonce) return send(res, 400, { ok: false, error: 'valid_client_nonce_required' });

        const now = Date.now();
        for (const [nonce, expiresAt] of seenClientNonces) {
          if (expiresAt <= now) seenClientNonces.delete(nonce);
        }
        if (seenClientNonces.has(clientNonce)) {
          return send(res, 409, { ok: false, error: 'client_nonce_replayed' });
        }
        if (seenClientNonces.size >= MAX_NONCES) {
          return send(res, 429, { ok: false, error: 'handshake_nonce_capacity_exceeded' });
        }
        seenClientNonces.set(clientNonce, now + NONCE_TTL_MS);
        return send(res, 200, {
          ok: true,
          protocol_version: PROTOCOL_VERSION,
          worker_instance_id: workerInstanceId,
          client_nonce: clientNonce,
          mode,
          capabilities: ['task-metadata-journal', 'idempotency', 'replay-eligibility-check'],
          limitations: ['no-network-sync', 'no-automatic-replay', 'no-live-mesh', 'no-arbitrary-shell'],
          nonce_ttl_ms: NONCE_TTL_MS
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/execute') {
        if (!token) return send(res, 503, { ok: false, error: 'execution_token_not_configured' });
        const authorization = req.headers.authorization || '';
        if (!authorization.startsWith('Bearer ') || !safeEqual(authorization.slice(7), token)) return send(res, 401, { ok: false, error: 'unauthorized' });
        const body = await readJson(req, MAX_EXECUTE_BODY_BYTES);
        if (!REMOTE_EXECUTION_ACTIONS.has(body.action)) return send(res, 403, { ok: false, error: 'execution_action_not_enabled_over_http' });
        const requestId = typeof body.request_id === 'string' && /^[A-Za-z0-9._:-]{8,100}$/.test(body.request_id) ? body.request_id : '';
        if (!requestId) return send(res, 400, { ok: false, error: 'valid_request_id_required' });
        // Keep the approval and executor input identical and structurally unambiguous.
        // Null, arrays, and primitive values must not be silently coerced into an empty object.
        const input = body.input === undefined ? {} : body.input;
        if (input === null || typeof input !== 'object' || Array.isArray(input)) {
          return send(res, 400, { ok: false, error: 'execution_input_must_be_object', request_id: requestId });
        }
        if (typeof approvalVerifier !== 'function') {
          return send(res, 403, { ok: false, error: 'approval_verifier_not_configured', request_id: requestId });
        }
        let approved = false;
        try {
          approved = (await approvalVerifier({
            requestId,
            action: body.action,
            input,
            approval: body.approval
          })) === true;
        } catch {
          approved = false;
        }
        if (!approved) return send(res, 403, { ok: false, error: 'server_side_approval_denied', request_id: requestId });
        const result = await executor.execute(body.action, input);
        return send(res, result.ok ? 200 : 400, { ok: result.ok, request_id: requestId, action: body.action, result });
      }
      if (req.method === 'GET' && url.pathname === '/api/tasks') {
        if (!token) return send(res, 503, { ok: false, error: 'read_token_not_configured' });
        const authorization = req.headers.authorization || '';
        if (!authorization.startsWith('Bearer ') || !safeEqual(authorization.slice(7), token)) return send(res, 401, { ok: false, error: 'unauthorized' });
        const snapshot = journal.inspect();
        return send(res, 200, { ok: true, mode, tasks: snapshot.tasks, corruptLines: snapshot.corruptLines });
      }
      if (req.method === 'POST' && url.pathname === '/api/tasks') {
        if (!token) return send(res, 503, { ok: false, error: 'write_token_not_configured' });
        const authorization = req.headers.authorization || '';
        if (!authorization.startsWith('Bearer ') || !safeEqual(authorization.slice(7), token)) {
          return send(res, 401, { ok: false, error: 'unauthorized' });
        }
        const body = await readJson(req);
        const task = body.task;
        const result = journal.enqueue(task);
        return send(res, result.accepted ? 201 : 200, { ok: true, ...result });
      }
      const replayMatch = /^\/api\/tasks\/([^/]+)\/replay-check$/.exec(url.pathname);
      if (req.method === 'POST' && replayMatch) {
        if (!token) return send(res, 503, { ok: false, error: 'write_token_not_configured' });
        const authorization = req.headers.authorization || '';
        if (!authorization.startsWith('Bearer ') || !safeEqual(authorization.slice(7), token)) {
          return send(res, 401, { ok: false, error: 'unauthorized' });
        }
        const body = await readJson(req);
        const result = journal.evaluateReplay(decodeURIComponent(replayMatch[1]), body.current_commit_sha || null);
        return send(res, result.action === 'NOT_FOUND' ? 404 : 200, { ok: true, result });
      }
      return send(res, 404, { ok: false, error: 'not_found' });
    } catch (err) {
      if (res.headersSent || res.destroyed) return;
      return send(res, err.statusCode || 400, { ok: false, error: err.message || 'request_failed' });
    }
  });
  return {
    server,
    setMode(next) {
      if (!MODES.has(next)) throw new TypeError('unsupported worker mode');
      mode = next;
    },
    listen(port = 0) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve(server.address());
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
  };
}
if (require.main === module) {
  const journalPath = process.env.HEAVENZFIRE_BRIDGE_JOURNAL;
  if (!journalPath) {
    process.stderr.write('Set HEAVENZFIRE_BRIDGE_JOURNAL to an explicit local JSONL path.\n');
    process.exitCode = 2;
  } else {
    const worker = createWorkerServer({ journalPath });
    const port = Number(process.env.HEAVENZFIRE_BRIDGE_PORT || 8798);
    worker.listen(port).then(address => {
      process.stdout.write(JSON.stringify({
        ok: true,
        service: 'heavenzfire-unified-field-worker',
        address,
        writeTokenConfigured: Boolean(process.env.HEAVENZFIRE_BRIDGE_TOKEN),
        mode: 'OFFLINE'
      }) + '\n');
    }).catch(err => {
      process.stderr.write('Worker failed to listen: ' + err.message + '\n');
      process.exitCode = 1;
    });
  }
}
module.exports = { createWorkerServer, MAX_BODY_BYTES, MAX_EXECUTE_BODY_BYTES, PROTOCOL_VERSION, NONCE_TTL_MS, MAX_NONCES };
