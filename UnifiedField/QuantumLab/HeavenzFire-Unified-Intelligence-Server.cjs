'use strict';

const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { createHistoricalRuntime, PROFILES } = require('./historical-profile-runtime.cjs');

const HOST = '127.0.0.1';
const PORT = Number(process.env.HF_UNIFIED_PORT || 11812);
const MAX_BODY_BYTES = 12000;
const MAX_SANDBOXES = 64;
const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:11811',
  'http://localhost:11811',
  'http://127.0.0.1:11812',
  'http://localhost:11812',
]);
const sandboxes = new Map();
let requestCount = 0;
let failureCount = 0;

function send(res, status, body, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function validHost(req) {
  const host = String(req.headers.host || '').toLowerCase();
  return host === '127.0.0.1:' + PORT || host === 'localhost:' + PORT ||
    host === '127.0.0.1' || host === 'localhost';
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body exceeds 12000 bytes.'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(Object.assign(new Error('Request body must be valid JSON.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function getSandbox(id) {
  if (!sandboxes.has(id)) {
    if (sandboxes.size >= MAX_SANDBOXES) {
      const oldest = sandboxes.keys().next().value;
      sandboxes.delete(oldest);
    }
    sandboxes.set(id, createHistoricalRuntime());
  }
  const runtime = sandboxes.get(id);
  sandboxes.delete(id);
  sandboxes.set(id, runtime);
  return runtime;
}

function safeSandboxId(value) {
  const id = String(value || 'default').trim();
  if (!/^[a-zA-Z0-9._-]{1,80}$/.test(id)) {
    throw Object.assign(new Error('sandboxId must be 1–80 letters, numbers, dots, underscores, or hyphens.'), { status: 400 });
  }
  return id;
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (!validHost(req)) return send(res, 403, { ok: false, error: { code: 'HOST_REJECTED', message: 'Loopback Host header required.' } });
  if (origin && !ALLOWED_ORIGINS.has(origin)) return send(res, 403, { ok: false, error: { code: 'ORIGIN_REJECTED', message: 'Origin is not allowed.' } });
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    });
    return res.end();
  }

  const url = new URL(req.url, 'http://' + HOST + ':' + PORT);
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, {
      ok: true,
      service: 'HeavenzFire Unified Intelligence',
      host: HOST,
      port: PORT,
      model: process.env.HF_UNIFIED_MODEL || 'heavenzfire-qwen-0.5b',
      inferenceBaseUrl: process.env.HF_UNIFIED_BASE_URL || 'http://127.0.0.1:11800/v1',
      requestCount,
      failureCount,
      activeSandboxCount: sandboxes.size,
      memoryPersistence: 'session-only',
    }, origin);
  }
  if (req.method === 'GET' && url.pathname === '/api/profiles') {
    return send(res, 200, {
      ok: true,
      profiles: Object.entries(PROFILES).map(([id, profile]) => ({ id, name: profile.name, dates: profile.dates, lens: profile.lens })),
      sharedModel: process.env.HF_UNIFIED_MODEL || 'heavenzfire-qwen-0.5b',
    }, origin);
  }

  if (req.method === 'POST' && (url.pathname === '/api/chat' || url.pathname === '/api/memory/reset')) {
    let body;
    try { body = await readJson(req); }
    catch (error) {
      return send(res, error.status || 400, { ok: false, error: { code: 'INVALID_REQUEST', message: error.message } }, origin);
    }
    let sandboxId;
    try { sandboxId = safeSandboxId(body.sandboxId); }
    catch (error) { return send(res, error.status || 400, { ok: false, error: { code: 'INVALID_SANDBOX_ID', message: error.message } }, origin); }

    const runtime = getSandbox(sandboxId);
    if (url.pathname === '/api/memory/reset') {
      try {
        const result = runtime.resetMemory(String(body.profileId || ''));
        return send(res, 200, { ok: true, sandboxId, ...result, persistence: 'session-only' }, origin);
      } catch (error) {
        return send(res, 400, { ok: false, error: { code: 'INVALID_PROFILE', message: error.message } }, origin);
      }
    }

    requestCount++;
    const requestId = randomUUID();
    try {
      const result = await runtime.respond({
        profileId: body.profileId,
        message: body.message,
      });
      return send(res, 200, { ...result, sandboxId, requestId, persistence: 'session-only' }, origin);
    } catch (error) {
      failureCount++;
      const status = Number.isInteger(error.httpStatus) ? error.httpStatus : 400;
      return send(res, status, {
        ok: false,
        sandboxId,
        requestId,
        error: {
          code: error.code || (error instanceof TypeError ? 'INVALID_REQUEST' : 'UNIFIED_RUNTIME_ERROR'),
          message: String(error.message || 'Request failed').slice(0, 500),
          retryable: Boolean(error.retryable),
        },
      }, origin);
    }
  }

  return send(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Route not found.' } }, origin);
});

server.on('clientError', (_error, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.listen(PORT, HOST, () => {
  process.stdout.write('HeavenzFire Unified Intelligence listening at http://' + HOST + ':' + PORT + '\n');
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
