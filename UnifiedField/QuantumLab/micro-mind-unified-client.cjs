'use strict';

/*
 * HeavenzFire Unified Intelligence browser client.
 * Safe to require from Node tests or load in a browser. This is an API adapter,
 * not a UI patch: the live Micro Mind page must explicitly instantiate it.
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HeavenzFireUnifiedClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildClientModule() {
  const DEFAULT_BASE_URL = 'http://127.0.0.1:11812';
  const DEFAULT_SANDBOX_ID = 'micro-mind';
  const DEFAULT_TIMEOUT_MS = 45000;
  const MAX_MESSAGE_CHARS = 4000;

  class UnifiedClientError extends Error {
    constructor(message, details = {}) {
      super(message);
      this.name = 'UnifiedClientError';
      this.code = details.code || 'UNIFIED_CLIENT_ERROR';
      this.status = details.status || 0;
      this.retryable = Boolean(details.retryable);
      this.requestId = details.requestId || null;
      this.cause = details.cause;
    }
  }

  function normalizeBaseUrl(value) {
    const url = new URL(value || DEFAULT_BASE_URL);
    if (url.protocol !== 'http:' ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.username || url.password || url.search || url.hash) {
      throw new TypeError('Unified API URL must be an HTTP loopback origin without credentials, query, or fragment.');
    }
    return url.toString().replace(/\/$/, '');
  }

  function createUnifiedClient(options = {}) {
    const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
    const sandboxId = String(options.sandboxId || DEFAULT_SANDBOX_ID);
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(sandboxId)) throw new TypeError('Invalid sandboxId.');
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required.');
    const timeoutMs = Math.max(1000, Math.min(Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS, 120000));
    const maxReadAttempts = Math.max(1, Math.min(Number(options.maxReadAttempts) || 3, 4));
    let consecutiveFailures = 0;
    let lastHealthyAt = null;

    async function request(path, init = {}, config = {}) {
      const method = init.method || 'GET';
      const attempts = method === 'GET' ? (config.attempts || maxReadAttempts) : 1;
      let lastError;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const controller = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
          const response = await fetchImpl(baseUrl + path, {
            ...init,
            headers: { Accept: 'application/json', ...(init.headers || {}) },
            signal: controller ? controller.signal : undefined,
            cache: 'no-store',
          });
          let data;
          try { data = await response.json(); }
          catch (cause) {
            throw new UnifiedClientError('Unified API returned invalid JSON.', {
              code: 'INVALID_API_RESPONSE', status: response.status, retryable: false, cause,
            });
          }
          if (!response.ok || data?.ok === false) {
            const detail = data?.error || {};
            throw new UnifiedClientError(
              typeof detail === 'string' ? detail : (detail.message || ('Unified API returned HTTP ' + response.status)),
              {
                code: detail.code || 'UNIFIED_API_ERROR',
                status: response.status,
                retryable: Boolean(detail.retryable) || response.status >= 500,
                requestId: data?.requestId || null,
              },
            );
          }
          consecutiveFailures = 0;
          if (path === '/api/health') lastHealthyAt = new Date().toISOString();
          return data;
        } catch (cause) {
          const isClientError = cause instanceof UnifiedClientError;
          lastError = isClientError ? cause : new UnifiedClientError(
            controller && controller.signal.aborted ? 'Unified API request timed out.' : 'Cannot reach the Unified Intelligence API.',
            {
              code: controller && controller.signal.aborted ? 'API_TIMEOUT' : 'API_UNREACHABLE',
              retryable: true,
              cause,
            },
          );
          consecutiveFailures++;
          if (attempt < attempts && method === 'GET' && lastError.retryable) {
            await new Promise(resolve => setTimeout(resolve, Math.min(150 * (2 ** (attempt - 1)), 600)));
            continue;
          }
          throw lastError;
        } finally {
          if (timer) clearTimeout(timer);
        }
      }
      throw lastError || new UnifiedClientError('Unified API request failed.');
    }

    return Object.freeze({
      baseUrl,
      sandboxId,
      getDiagnostics() {
        return Object.freeze({ baseUrl, sandboxId, consecutiveFailures, lastHealthyAt });
      },
      async health() {
        return request('/api/health');
      },
      async profiles() {
        const result = await request('/api/profiles');
        if (!Array.isArray(result.profiles) || result.profiles.length === 0) {
          throw new UnifiedClientError('Unified API returned an empty profile registry.', { code: 'INVALID_PROFILE_REGISTRY' });
        }
        return result.profiles;
      },
      async chat({ profileId, message }) {
        const normalizedMessage = String(message || '').trim();
        const normalizedProfile = String(profileId || '').trim();
        if (!normalizedProfile) throw new UnifiedClientError('Choose a reasoning profile first.', { code: 'PROFILE_REQUIRED' });
        if (!normalizedMessage || normalizedMessage.length > MAX_MESSAGE_CHARS) {
          throw new UnifiedClientError('Message must contain 1–4000 characters.', { code: 'INVALID_MESSAGE' });
        }
        // Never automatically retry a chat POST: a timeout can occur after inference
        // completed, so retrying could duplicate generation and memory mutations.
        const result = await request('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sandboxId, profileId: normalizedProfile, message: normalizedMessage }),
        });
        const answer = String(result.answer || result.response || '').trim();
        if (!answer) throw new UnifiedClientError('Unified API returned no answer.', {
          code: 'EMPTY_ANSWER', requestId: result.requestId || null,
        });
        return { ...result, answer };
      },
      async resetMemory(profileId) {
        const normalizedProfile = String(profileId || '').trim();
        if (!normalizedProfile) throw new UnifiedClientError('Choose a reasoning profile before resetting memory.', { code: 'PROFILE_REQUIRED' });
        return request('/api/memory/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sandboxId, profileId: normalizedProfile }),
        });
      },
    });
  }

  return Object.freeze({ createUnifiedClient, UnifiedClientError, normalizeBaseUrl });
});
