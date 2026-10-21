'use strict';

const crypto = require('node:crypto');

function blocked(reason) {
  return { state: 'blocked', reason, published: 0, duplicate: 0, failed: 0, errors: [] };
}

async function publishWorkerResultsToJournal(artifact, options = {}) {
  const token = options.token ?? process.env.HEAVENZFIRE_BRIDGE_TOKEN ?? '';
  const configuredBase = options.baseUrl ?? process.env.HEAVENZFIRE_BRIDGE_URL ?? 'http://127.0.0.1:8798';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  let base;
  try {
    const parsed = new URL(configuredBase);
    if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' ||
        parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      return blocked('Journal URL must be a plain loopback HTTP origin');
    }
    base = parsed.origin;
  } catch {
    return blocked('Journal URL is invalid');
  }

  if (!token) return blocked('HEAVENZFIRE_BRIDGE_TOKEN is not configured');
  if (typeof fetchImpl !== 'function') return blocked('fetch is unavailable');
  if (!artifact || typeof artifact.file !== 'string' ||
      !artifact.file || artifact.file !== artifact.file.split(/[\\/]/).pop() ||
      !Array.isArray(artifact.results)) {
    return blocked('No valid worker result artifact');
  }

  let published = 0;
  let duplicate = 0;
  let failed = 0;
  const errors = [];

  for (const item of artifact.results) {
    const model = String((item && item.model) || 'unknown').slice(0, 100);
    const identity = artifact.file + '|' + model;
    const digest = crypto.createHash('sha256').update(identity).digest('hex');
    const task = {
      task_id: 'local-worker-' + digest.slice(0, 24),
      objective: 'Independently review the untrusted local model draft from ' + model +
        '; do not execute generated code. Artifact: ' + artifact.file,
      scope: ['local-artifact-review', 'independent-verification'],
      risk_class: 'LOW',
      idempotency_key: 'local-worker-result-' + digest,
      evidence_refs: [artifact.file],
      dependencies: []
    };

    try {
      const response = await fetchImpl(base + '/api/tasks', {
        method: 'POST',
        signal: AbortSignal.timeout(2500),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({ task })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.ok !== true) {
        throw new Error((data && data.error) || ('HTTP ' + response.status));
      }
      if (data.duplicate === true) duplicate++;
      else published++;
    } catch (err) {
      failed++;
      errors.push({ model, error: String(err && err.message || err) });
    }
  }

  return { state: failed ? 'partial' : 'published', published, duplicate, failed, errors };
}

module.exports = { publishWorkerResultsToJournal };
