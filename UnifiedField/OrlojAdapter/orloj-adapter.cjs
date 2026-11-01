'use strict';

const { validateTaskRecord } = require('../FieldCore/shared-task-contract.cjs');

const COMPONENT_ID = 'orloj.agent-infrastructure';
const COMPONENT_VERSION = '0.1.0';
const UPSTREAM = 'https://github.com/OrlojHQ/orloj';
const UPSTREAM_REVISION = '00091ac69b8f72a20969e7b02a73248b075125f2';
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const TASK_NAME = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function normalizeBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('baseUrl_required');
  let url;
  try { url = new URL(value); } catch { throw new TypeError('baseUrl_invalid'); }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.has(url.hostname.toLowerCase()) ||
      url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('orloj_base_url_must_be_plain_http_loopback_origin');
  }
  return url.origin;
}

function boundedName(value) {
  const name = String(value || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!name || name.length > 63 || !TASK_NAME.test(name)) throw new TypeError('orloj_task_name_invalid');
  return name;
}

function assertApprovedTask(record) {
  validateTaskRecord(record);
  if (record.status !== 'approved' || record.approvalState !== 'approved') {
    throw new Error('explicit_heavenzfire_task_approval_required');
  }
  if (!record.evidence.some(item => item.kind === 'approval' && typeof item.actor === 'string' && item.actor.trim())) {
    throw new Error('auditable_approval_evidence_required');
  }
}

function createOrlojAdapter({
  baseUrl = process.env.HF_ORLOJ_URL || 'http://127.0.0.1:8080',
  token = process.env.ORLOJ_API_TOKEN || '',
  systemName = process.env.HF_ORLOJ_SYSTEM || '',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch
} = {}) {
  const origin = normalizeBaseUrl(baseUrl);
  if (typeof token !== 'string') throw new TypeError('token_must_be_string');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000) {
    throw new RangeError('timeoutMs_must_be_100_to_60000');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch_implementation_required');

  async function request(path, { method = 'GET', body } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = 'Bearer ' + token;
    try {
      const response = await fetchImpl(origin + path, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal, redirect: 'error'
      });
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('orloj_response_too_large');
      if (!response.ok) throw new Error('orloj_http_' + response.status);
      if (!text) return null;
      try { return JSON.parse(text); } catch { throw new Error('orloj_invalid_json_response'); }
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('orloj_request_timeout');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return Object.freeze({
    componentId: COMPONENT_ID,
    componentVersion: COMPONENT_VERSION,
    upstream: UPSTREAM,
    upstreamRevision: UPSTREAM_REVISION,
    capabilities: Object.freeze([
      'orloj.health.read.v1',
      'orloj.capabilities.read.v1',
      'orloj.tasks.submit-approved.v1',
      'orloj.tasks.status.read.v1'
    ]),
    permissions: Object.freeze({
      network: 'loopback-only',
      reads: ['/healthz', '/v1/capabilities', '/v1/tasks/{name}'],
      writes: ['/v1/tasks (only after explicit HeavenzFire approval)'],
      secrets: 'optional bearer token supplied at runtime; never returned or persisted by this adapter'
    }),

    async checkHealth() {
      const health = await request('/healthz');
      if (!health || health.status !== 'ok') throw new Error('orloj_health_check_failed');
      const snapshot = await request('/v1/capabilities');
      if (!snapshot || !Array.isArray(snapshot.capabilities)) throw new Error('orloj_capability_snapshot_invalid');
      return {
        ok: true,
        componentId: COMPONENT_ID,
        upstreamRevision: UPSTREAM_REVISION,
        checkedAt: new Date().toISOString(),
        capabilityCount: snapshot.capabilities.length,
        capabilities: snapshot.capabilities.map(item => ({
          id: String(item.id || ''),
          enabled: item.enabled === true,
          source: String(item.source || '')
        }))
      };
    },

    async submitApprovedTask(record, options = {}) {
      assertApprovedTask(record);
      const selectedSystem = options.systemName || systemName;
      if (typeof selectedSystem !== 'string' || !selectedSystem.trim()) {
        throw new Error('orloj_system_name_required');
      }
      const name = boundedName('hf-' + record.taskId);
      const manifest = {
        apiVersion: 'orloj.dev/v1',
        kind: 'Task',
        metadata: {
          name,
          labels: {
            'app.kubernetes.io/managed-by': 'heavenzfire-unified-field',
            'heavenzfire.dev/component': COMPONENT_ID
          },
          annotations: {
            'heavenzfire.dev/task-id': record.taskId,
            'heavenzfire.dev/source': record.source,
            'heavenzfire.dev/upstream-revision': UPSTREAM_REVISION
          }
        },
        spec: {
          system: selectedSystem.trim(),
          input: {
            goal: record.goal,
            heavenzfire_task_id: record.taskId
          },
          priority: 'normal'
        }
      };
      const created = await request('/v1/tasks', { method: 'POST', body: manifest });
      if (!created || !created.metadata || created.metadata.name !== name || created.kind !== 'Task') {
        throw new Error('orloj_task_create_response_mismatch');
      }
      return {
        taskId: record.taskId,
        providerTaskName: name,
        providerPhase: created.status && created.status.phase ? created.status.phase : 'Pending',
        created: true,
        executionMayBegin: true,
        upstreamRevision: UPSTREAM_REVISION
      };
    },

    async getTaskStatus(providerTaskName) {
      const name = boundedName(providerTaskName);
      const task = await request('/v1/tasks/' + encodeURIComponent(name));
      if (!task || !task.metadata || task.metadata.name !== name || task.kind !== 'Task') {
        throw new Error('orloj_task_response_mismatch');
      }
      return {
        providerTaskName: name,
        phase: task.status && task.status.phase ? task.status.phase : 'Unknown',
        attempts: task.status && Number.isInteger(task.status.attempts) ? task.status.attempts : 0,
        assignedWorker: task.status && task.status.assignedWorker ? task.status.assignedWorker : null,
        completedAt: task.status && task.status.completedAt ? task.status.completedAt : null,
        lastError: task.status && task.status.lastError ? String(task.status.lastError).slice(0, 500) : null
      };
    }
  });
}

module.exports = {
  COMPONENT_ID, COMPONENT_VERSION, UPSTREAM, UPSTREAM_REVISION,
  normalizeBaseUrl, assertApprovedTask, createOrlojAdapter
};
