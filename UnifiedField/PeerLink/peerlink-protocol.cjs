'use strict';

const crypto = require('node:crypto');

const PROTOCOL_VERSION = 1;
const MAX_BODY_BYTES = 64 * 1024;
const TASK_TYPES = new Set(['inference.chat']);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function send(res, status, body) {
  if (res.headersSent) return;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(JSON.stringify(body));
}

function readJson(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        const error = Object.assign(new Error('request body exceeds limit'), { status: 413 });
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const value = JSON.parse(raw || '{}');
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          reject(Object.assign(new Error('JSON object required'), { status: 400 }));
          return;
        }
        resolve(value);
      } catch {
        reject(Object.assign(new Error('invalid JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function bearerMatches(req, expected) {
  const supplied = String(req.headers.authorization || '').match(/^Bearer ([^\s]+)$/)?.[1] || '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function validPeerId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(value);
}

function validNonce(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{22,128}$/.test(value);
}

function validateCapabilities(value) {
  if (!Array.isArray(value) || value.length > 32 ||
      value.some(x => typeof x !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(x))) {
    fail('invalid_capabilities', 'capabilities must be an array of up to 32 capability identifiers');
  }
  return [...new Set(value)];
}

function validateTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) fail('invalid_task', 'task must be an object');
  if (typeof task.idempotency_key !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(task.idempotency_key)) {
    fail('invalid_idempotency_key', 'idempotency_key must be 8-128 safe characters');
  }
  if (!TASK_TYPES.has(task.type)) fail('unsupported_task_type', 'only inference.chat tasks are accepted');
  const payload = task.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('invalid_payload', 'payload must be an object');
  if (typeof payload.model !== 'string' || !payload.model.trim() || payload.model.length > 128) {
    fail('invalid_model', 'payload.model must be 1-128 characters');
  }
  if (!Array.isArray(payload.messages) || payload.messages.length < 1 || payload.messages.length > 32) {
    fail('invalid_messages', 'payload.messages must contain 1-32 messages');
  }
  let total = 0;
  const messages = payload.messages.map(message => {
    if (!message || typeof message !== 'object' || Array.isArray(message) ||
        !['system', 'user', 'assistant'].includes(message.role) ||
        typeof message.content !== 'string' || message.content.length > 12000) {
      fail('invalid_message', 'each message requires a supported role and text content up to 12000 characters');
    }
    total += message.content.length;
    return { role: message.role, content: message.content };
  });
  if (total > 24000) fail('messages_too_large', 'combined message content exceeds 24000 characters');
  const maxTokens = payload.max_tokens === undefined ? 256 : payload.max_tokens;
  const temperature = payload.temperature === undefined ? 0.2 : payload.temperature;
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 2048) {
    fail('invalid_max_tokens', 'max_tokens must be an integer from 1 to 2048');
  }
  if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    fail('invalid_temperature', 'temperature must be between 0 and 2');
  }
  return Object.freeze({
    task_id: typeof task.task_id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(task.task_id)
      ? task.task_id : crypto.randomUUID(),
    idempotency_key: task.idempotency_key,
    type: 'inference.chat',
    payload: Object.freeze({ model: payload.model.trim(), messages, max_tokens: maxTokens, temperature }),
    created_at: typeof task.created_at === 'string' ? task.created_at : new Date().toISOString()
  });
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

module.exports = {
  PROTOCOL_VERSION, MAX_BODY_BYTES, TASK_TYPES, fail, send, readJson,
  bearerMatches, validPeerId, validNonce, validateCapabilities, validateTask, isLoopback
};
