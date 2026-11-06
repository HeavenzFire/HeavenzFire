'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  PROTOCOL_VERSION, send, readJson, bearerMatches, validPeerId, validNonce,
  validateCapabilities, validateTask, isLoopback
} = require('./peerlink-protocol.cjs');

function createPeerLinkHub(options = {}) {
  const token = options.token || process.env.HF_PEERLINK_TOKEN;
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error('HF_PEERLINK_TOKEN must contain at least 32 characters');
  }
  const host = options.host || process.env.HF_PEERLINK_HOST || '127.0.0.1';
  const port = Number(options.port ?? process.env.HF_PEERLINK_PORT ?? 18990);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('port must be 0..65535');
  const tls = options.tls || null;
  if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost' && !tls) {
    throw new Error('non-loopback hub binds require TLS key and certificate');
  }
  const journalPath = options.journalPath || process.env.HF_PEERLINK_JOURNAL ||
    path.join(process.cwd(), 'state', 'peerlink-events.jsonl');
  const leaseMs = Math.max(10000, Math.min(Number(options.leaseMs || 60000), 300000));
  const peers = new Map();
  const tasks = new Map();
  const idempotency = new Map();
  const queue = [];
  let closed = false;

  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  function append(event) {
    const fd = fs.openSync(journalPath, 'a', 0o600);
    try {
      fs.writeSync(fd, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n');
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
  }
  function restore() {
    if (!fs.existsSync(journalPath)) return;
    const raw = fs.readFileSync(journalPath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      let event;
      try { event = JSON.parse(lines[i]); }
      catch { throw new Error('PeerLink journal is corrupt at line ' + (i + 1) + '; refusing unsafe replay'); }
      if (event.kind === 'task_queued' && event.task) {
        tasks.set(event.task.task_id, { ...event.task, status: 'QUEUED', peer_id: null, lease_until: null, result: null });
        idempotency.set(event.task.idempotency_key, event.task.task_id);
      } else if (event.kind === 'task_claimed' && tasks.has(event.task_id)) {
        const task = tasks.get(event.task_id);
        task.status = 'QUEUED'; // interrupted leases are safely requeued after restart
        task.peer_id = null;
        task.lease_until = null;
      } else if (event.kind === 'task_result' && tasks.has(event.task_id)) {
        const task = tasks.get(event.task_id);
        task.status = event.ok ? 'COMPLETED' : 'FAILED';
        task.result = event.result || null;
        task.error = event.error || null;
        task.peer_id = event.peer_id || null;
        task.lease_until = null;
      }
    }
    for (const task of tasks.values()) if (task.status === 'QUEUED') queue.push(task.task_id);
  }
  restore();

  function authenticate(req, res) {
    const supplied = String(req.headers.authorization || '').match(/^Bearer ([^\s]+)$/)?.[1] || '';
    if (bearerMatches(req, token)) return { role: 'controller' };
    for (const peer of peers.values()) {
      if (peer.session_token && supplied.length === peer.session_token.length &&
          crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(peer.session_token))) {
        return { role: 'peer', peer };
      }
    }
    send(res, 401, { ok: false, error: 'unauthorized' });
    return null;
  }

  function expireLeases() {
    const now = Date.now();
    for (const task of tasks.values()) {
      if (task.status === 'LEASED' && task.lease_until <= now) {
        task.status = 'QUEUED';
        task.peer_id = null;
        task.lease_until = null;
        queue.push(task.task_id);
        append({ kind: 'task_requeued', task_id: task.task_id, reason: 'lease_expired' });
      }
    }
  }

  const handler = async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return send(res, 200, {
          ok: true, service: 'heavenzfire-peerlink-hub', protocol_version: PROTOCOL_VERSION,
          host, port, peers_online: [...peers.values()].filter(p => Date.now() - p.last_seen < 45000).length,
          queued_tasks: [...tasks.values()].filter(t => t.status === 'QUEUED').length,
          active_leases: [...tasks.values()].filter(t => t.status === 'LEASED').length,
          persistence: 'append-only-jsonl'
        });
      }
      const auth = authenticate(req, res);
      if (!auth) return;

      if (req.method === 'POST' && url.pathname === '/v1/peers/register') {
        if (auth.role !== 'controller') return send(res, 403, { ok: false, error: 'controller_auth_required' });
        const body = await readJson(req, 8192);
        if (!validPeerId(body.peer_id) || !validNonce(body.client_nonce) ||
            body.protocol_version !== PROTOCOL_VERSION) {
          return send(res, 400, { ok: false, error: 'invalid_handshake' });
        }
        const capabilities = validateCapabilities(body.capabilities || []);
        const peer = {
          peer_id: body.peer_id, capabilities, registered_at: new Date().toISOString(),
          last_seen: Date.now(), session_token: crypto.randomBytes(32).toString('hex')
        };
        peers.set(peer.peer_id, peer);
        return send(res, 200, {
          ok: true, protocol_version: PROTOCOL_VERSION, peer_id: peer.peer_id,
          client_nonce: body.client_nonce, server_nonce: crypto.randomBytes(24).toString('base64url'),
          session_token: peer.session_token, heartbeat_interval_ms: 15000,
          lease_ms: leaseMs, capabilities
        });
      }

      if (auth.role === 'peer') {
        const peer = auth.peer;
        if (req.method === 'POST' && url.pathname === '/v1/peers/heartbeat') {
          const body = await readJson(req, 4096);
          if (body.peer_id !== peer.peer_id) return send(res, 403, { ok: false, error: 'peer_identity_mismatch' });
          peer.last_seen = Date.now();
          return send(res, 200, { ok: true, peer_id: peer.peer_id, at: new Date().toISOString() });
        }
        if (req.method === 'POST' && url.pathname === '/v1/peers/poll') {
          const body = await readJson(req, 4096);
          if (body.peer_id !== peer.peer_id) return send(res, 403, { ok: false, error: 'peer_identity_mismatch' });
          peer.last_seen = Date.now();
          expireLeases();
          const supported = new Set(peer.capabilities);
          const task = queue.map(id => tasks.get(id)).find(item => item && item.status === 'QUEUED' && supported.has(item.type));
          if (!task) return send(res, 200, { ok: true, task: null, idle: true });
          task.status = 'LEASED';
          task.peer_id = peer.peer_id;
          task.lease_until = Date.now() + leaseMs;
          append({ kind: 'task_claimed', task_id: task.task_id, peer_id: peer.peer_id });
          const index = queue.indexOf(task.task_id);
          if (index >= 0) queue.splice(index, 1);
          return send(res, 200, { ok: true, task: { task_id: task.task_id, type: task.type, payload: task.payload }, lease_ms: leaseMs });
        }
        if (req.method === 'POST' && url.pathname === '/v1/peers/result') {
          const body = await readJson(req, 16384);
          if (body.peer_id !== peer.peer_id || typeof body.task_id !== 'string') {
            return send(res, 400, { ok: false, error: 'invalid_result_identity' });
          }
          const task = tasks.get(body.task_id);
          if (!task || task.status !== 'LEASED' || task.peer_id !== peer.peer_id) {
            return send(res, 409, { ok: false, error: 'task_lease_not_owned' });
          }
          const ok = body.ok === true;
          const result = ok && body.result && typeof body.result === 'object' ? body.result : null;
          const error = ok ? null : String(body.error || 'worker_failed').slice(0, 500);
          append({ kind: 'task_result', task_id: task.task_id, peer_id: peer.peer_id, ok, result, error });
          task.status = ok ? 'COMPLETED' : 'FAILED';
          task.result = result;
          task.error = error;
          task.lease_until = null;
          return send(res, 200, { ok: true, task_id: task.task_id, status: task.status });
        }
        return send(res, 404, { ok: false, error: 'not_found' });
      }

      if (req.method === 'POST' && url.pathname === '/v1/tasks') {
        const body = await readJson(req, 32768);
        const task = validateTask(body.task);
        const existingId = idempotency.get(task.idempotency_key);
        if (existingId) return send(res, 200, { ok: true, duplicate: true, task: taskView(tasks.get(existingId)) });
        if (tasks.size >= 5000) return send(res, 503, { ok: false, error: 'task_capacity_reached' });
        if (tasks.has(task.task_id)) return send(res, 409, { ok: false, error: 'task_id_conflict' });
        const stored = { ...task, status: 'QUEUED', peer_id: null, lease_until: null, result: null, error: null };
        append({ kind: 'task_queued', task: { task_id: task.task_id, idempotency_key: task.idempotency_key, type: task.type, payload: task.payload, created_at: task.created_at } });
        tasks.set(task.task_id, stored);
        idempotency.set(task.idempotency_key, task.task_id);
        queue.push(task.task_id);
        return send(res, 202, { ok: true, duplicate: false, task: taskView(stored) });
      }

      if (req.method === 'GET' && url.pathname.startsWith('/v1/tasks/')) {
        const id = decodeURIComponent(url.pathname.slice('/v1/tasks/'.length));
        const task = tasks.get(id);
        return task ? send(res, 200, { ok: true, task: taskView(task) }) : send(res, 404, { ok: false, error: 'task_not_found' });
      }
      return send(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      return send(res, error.status || 400, { ok: false, error: error.code || 'request_failed', message: String(error.message || 'request failed').slice(0, 300) });
    }
  };

  function taskView(task) {
    if (!task) return null;
    return {
      task_id: task.task_id, idempotency_key: task.idempotency_key, type: task.type,
      status: task.status, peer_id: task.peer_id, created_at: task.created_at,
      result: task.result, error: task.error
    };
  }

  const server = tls
    ? https.createServer({ key: tls.key, cert: tls.cert }, handler)
    : http.createServer(handler);

  return Object.freeze({
    server,
    listen() {
      return new Promise((resolve, reject) => {
        const onError = error => { server.off('listening', onListening); reject(error); };
        const onListening = () => { server.off('error', onError); resolve(server.address()); };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
    },
    close() {
      if (closed) return Promise.resolve();
      closed = true;
      return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
    get closed() { return closed; }
  });
}

module.exports = { createPeerLinkHub };
