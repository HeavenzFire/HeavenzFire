'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createEnvelope, validateEnvelope } = require('../PropagationFabric/fabric-envelope.cjs');

const APPROVAL_REQUIRED = new Set([
  'HIGH', 'PRIVILEGED', 'DESTRUCTIVE', 'CREDENTIAL', 'NETWORK_CHANGE', 'INSTALL', 'EXTERNAL'
]);
const TASK_STATUSES = new Set([
  'proposed', 'awaiting_approval', 'approved', 'queued', 'running',
  'succeeded', 'failed', 'blocked', 'cancelled'
]);
const MESSAGE_ACKS = new Set(['delivered', 'failed', 'rejected']);
const MAX_TASK_BYTES = 16 * 1024;
const MAX_EVENT_BYTES = 256 * 1024;

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function requireText(value, name, max = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new TypeError(name + '_invalid');
  }
  return value.trim();
}

function createTeamStore(options = {}) {
  const rootDir = path.resolve(options.rootDir || __dirname);
  const registryPath = path.resolve(options.registryPath || path.join(rootDir, 'team-registry.json'));
  const ledgerPath = path.resolve(options.ledgerPath || path.join(rootDir, 'team-events.jsonl'));
  const now = options.now || (() => new Date().toISOString());

  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  if (!fs.existsSync(ledgerPath)) fs.writeFileSync(ledgerPath, '', { encoding: 'utf8', flag: 'wx' });

  let registry;
  try {
    registry = fs.existsSync(registryPath)
      ? JSON.parse(fs.readFileSync(registryPath, 'utf8').replace(/^\uFEFF/, ''))
      : { schema_version: 1, providers: [] };
  } catch {
    throw new Error('team_registry_invalid_json');
  }
  if (!registry || registry.schema_version !== 1 || !Array.isArray(registry.providers)) {
    throw new Error('team_registry_unsupported_schema');
  }

  const events = [];
  const seenEventIds = new Set();

  function loadLedger() {
    const lines = fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); } catch {
        throw new Error('team_ledger_corrupt_line_' + (i + 1));
      }
      if (!event || event.schema !== 'heavenzfire.team.event.v1' ||
          typeof event.event_id !== 'string' || typeof event.event_type !== 'string' ||
          !event.payload || typeof event.payload !== 'object') {
        throw new Error('team_ledger_invalid_event_' + (i + 1));
      }
      if (seenEventIds.has(event.event_id)) throw new Error('team_ledger_duplicate_event_id');
      seenEventIds.add(event.event_id);
      events.push(event);
    }
  }
  loadLedger();

  function appendEvent(eventType, payload) {
    const event = {
      schema: 'heavenzfire.team.event.v1',
      event_id: crypto.randomUUID(),
      event_type: eventType,
      occurred_at: now(),
      payload
    };
    if (byteLength(event) > MAX_EVENT_BYTES) throw new Error('team_event_too_large');
    const fd = fs.openSync(ledgerPath, 'a');
    try {
      fs.writeSync(fd, JSON.stringify(event) + '\n', null, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    events.push(event);
    seenEventIds.add(event.event_id);
    return event;
  }

  function snapshot() {
    const tasks = new Map();
    const messages = new Map();
    const latestProviderProbe = new Map();
    for (const event of events) {
      const p = event.payload;
      if (event.event_type === 'task.created') tasks.set(p.task_id, { ...p });
      if (event.event_type === 'task.transitioned') {
        const task = tasks.get(p.task_id);
        if (task) {
          task.status = p.status;
          task.updated_at = event.occurred_at;
          if (p.approval) task.approval = p.approval;
          if (p.reason) task.last_transition_reason = p.reason;
        }
      }
      if (event.event_type === 'message.queued') messages.set(p.message_id, { ...p });
      if (event.event_type === 'message.acknowledged') {
        const message = messages.get(p.message_id);
        if (message) {
          message.delivery_status = p.delivery_status;
          message.acknowledged_at = event.occurred_at;
          message.acknowledged_by = p.acknowledged_by;
          message.ack_detail = p.detail || '';
          if (p.result !== undefined) message.result = p.result;
        }
      }
      if (event.event_type === 'provider.probe') latestProviderProbe.set(p.provider_id, { ...p, occurred_at: event.occurred_at });
    }
    const providers = registry.providers.map((provider) => {
      const probe = latestProviderProbe.get(provider.id);
      return probe ? { ...provider, live_status: probe.status, last_probe: probe } :
        { ...provider, live_status: provider.initial_status || 'unknown', last_probe: null };
    });
    return {
      schema: 'heavenzfire.team.snapshot.v1',
      generated_at: now(),
      provider_count: providers.length,
      providers,
      task_count: tasks.size,
      tasks: [...tasks.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
      message_count: messages.size,
      messages: [...messages.values()].sort((a, b) => String(b.queued_at).localeCompare(String(a.queued_at))),
      event_count: events.length,
      ledger_path: ledgerPath
    };
  }

  function createTask(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('task_object_required');
    const title = requireText(input.title, 'task_title', 200);
    const owner = requireText(input.owner || 'team-coordinator', 'task_owner', 100);
    const riskClass = String(input.risk_class || 'LOW').toUpperCase();
    if (!/^[A-Z_]{2,32}$/.test(riskClass)) throw new TypeError('task_risk_class_invalid');
    const idempotencyKey = input.idempotency_key === undefined ? null : requireText(input.idempotency_key, 'idempotency_key', 128);
    const payload = input.payload === undefined ? {} : input.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('task_payload_object_required');
    if (byteLength(payload) > MAX_TASK_BYTES) throw new Error('task_payload_too_large');

    const current = snapshot();
    if (idempotencyKey) {
      const prior = current.tasks.find((task) => task.idempotency_key === idempotencyKey);
      if (prior) return { ok: true, duplicate: true, task: prior };
    }
    const requiresApproval = APPROVAL_REQUIRED.has(riskClass);
    const task = {
      task_id: 'hftask-' + crypto.randomUUID(),
      title,
      owner,
      risk_class: riskClass,
      approval_required: requiresApproval,
      status: requiresApproval ? 'awaiting_approval' : 'proposed',
      idempotency_key: idempotencyKey,
      payload,
      created_at: now(),
      updated_at: now(),
      execution_mode: 'proposal_and_audit_only'
    };
    appendEvent('task.created', task);
    return { ok: true, duplicate: false, task };
  }

  function approveTask(taskId, approval) {
    const id = requireText(taskId, 'task_id', 128);
    const current = snapshot().tasks.find((task) => task.task_id === id);
    if (!current) return { ok: false, error: 'task_not_found' };
    if (!['proposed', 'awaiting_approval'].includes(current.status)) return { ok: false, error: 'task_not_awaitable' };
    if (!approval || approval.approved !== true) return { ok: false, error: 'explicit_approval_required' };
    const approvedBy = requireText(approval.approved_by, 'approval_actor', 100);
    const reason = requireText(approval.reason, 'approval_reason', 500);
    const record = {
      approved: true,
      approved_by: approvedBy,
      reason,
      approval_method: 'explicit_operator_confirmation',
      approved_at: now()
    };
    appendEvent('task.transitioned', { task_id: id, status: 'approved', approval: record, reason: 'Explicit operator approval recorded' });
    return { ok: true, task: snapshot().tasks.find((task) => task.task_id === id) };
  }

  function transitionTask(taskId, nextStatus, details = {}) {
    const id = requireText(taskId, 'task_id', 128);
    if (!TASK_STATUSES.has(nextStatus)) return { ok: false, error: 'task_status_invalid' };
    const current = snapshot().tasks.find((task) => task.task_id === id);
    if (!current) return { ok: false, error: 'task_not_found' };
    const allowed = {
      proposed: ['queued', 'cancelled', 'blocked'],
      awaiting_approval: ['cancelled', 'blocked'],
      approved: ['queued', 'cancelled', 'blocked'],
      queued: ['running', 'cancelled', 'blocked'],
      running: ['succeeded', 'failed', 'blocked'],
      succeeded: [], failed: [], blocked: [], cancelled: []
    };
    if (!allowed[current.status].includes(nextStatus)) return { ok: false, error: 'invalid_task_transition', from: current.status, to: nextStatus };
    if (nextStatus === 'queued' && current.approval_required && current.status !== 'approved') {
      return { ok: false, error: 'explicit_approval_required' };
    }
    if (nextStatus === 'running' && current.status !== 'queued') return { ok: false, error: 'task_must_be_queued' };
    const reason = details.reason === undefined ? '' : requireText(details.reason, 'transition_reason', 500);
    appendEvent('task.transitioned', { task_id: id, status: nextStatus, reason });
    return { ok: true, task: snapshot().tasks.find((task) => task.task_id === id) };
  }

  function recordProviderProbe(providerId, status, evidence) {
    const id = requireText(providerId, 'provider_id', 100);
    if (!registry.providers.some((provider) => provider.id === id)) return { ok: false, error: 'provider_not_registered' };
    if (!['verified', 'unavailable', 'auth_required', 'unknown', 'blocked'].includes(status)) {
      return { ok: false, error: 'provider_status_invalid' };
    }
    const note = requireText(evidence, 'probe_evidence', 1000);
    if (status === 'verified' && !/\b(HTTP 200|authenticated|inference succeeded|test passed|response received)\b/i.test(note)) {
      return { ok: false, error: 'verified_status_requires_test_evidence' };
    }
    appendEvent('provider.probe', { provider_id: id, status, evidence: note });
    return { ok: true, provider: snapshot().providers.find((provider) => provider.id === id) };
  }

  function queueMessage(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('message_object_required');
    const source = requireText(input.source, 'message_source', 100);
    const target = requireText(input.target || 'broadcast', 'message_target', 100);
    const type = input.type || 'event';
    const payload = input.payload === undefined ? {} : input.payload;
    const idempotencyKey = input.idempotency_key === undefined ? null : requireText(input.idempotency_key, 'message_idempotency_key', 128);
    const current = snapshot();
    if (idempotencyKey) {
      const prior = current.messages.find((message) => message.idempotency_key === idempotencyKey);
      if (prior) return { ok: true, duplicate: true, message: prior };
    }
    if (target !== 'broadcast' && !registry.providers.some((provider) => provider.id === target)) {
      return { ok: false, error: 'message_target_not_registered' };
    }
    const envelope = createEnvelope({
      type,
      source,
      target,
      payload,
      ttlMs: Number.isInteger(input.ttl_ms) ? input.ttl_ms : 60_000,
      correlationId: input.correlation_id || null
    });
    validateEnvelope(envelope);
    const message = {
      message_id: envelope.id,
      envelope,
      idempotency_key: idempotencyKey,
      delivery_status: 'queued',
      queued_at: now(),
      note: 'Durably queued; delivery is not claimed until a transport acknowledges it.'
    };
    appendEvent('message.queued', message);
    return { ok: true, duplicate: false, message };
  }

  function acknowledgeMessage(messageId, acknowledgement) {
    const id = requireText(messageId, 'message_id', 128);
    const current = snapshot().messages.find((message) => message.message_id === id);
    if (!current) return { ok: false, error: 'message_not_found' };
    if (current.delivery_status !== 'queued') return { ok: false, error: 'message_already_acknowledged' };
    const status = acknowledgement && acknowledgement.status;
    if (!MESSAGE_ACKS.has(status)) return { ok: false, error: 'message_ack_status_invalid' };
    const acknowledgedBy = requireText(acknowledgement.acknowledged_by, 'message_ack_actor', 100);
    const detail = acknowledgement.detail === undefined ? '' : String(acknowledgement.detail).slice(0, 500);
    const result = acknowledgement.result;
    if (result !== undefined && (!result || typeof result !== 'object' || Array.isArray(result) || byteLength(result) > MAX_TASK_BYTES)) {
      return { ok: false, error: 'message_result_invalid_or_too_large' };
    }
    appendEvent('message.acknowledged', { message_id: id, delivery_status: status, acknowledged_by: acknowledgedBy, detail, ...(result === undefined ? {} : { result }) });
    return { ok: true, message: snapshot().messages.find((message) => message.message_id === id) };
  }

  return {
    createTask,
    approveTask,
    transitionTask,
    recordProviderProbe,
    queueMessage,
    acknowledgeMessage,
    snapshot,
    ledgerPath
  };
}

module.exports = { createTeamStore, APPROVAL_REQUIRED, TASK_STATUSES };