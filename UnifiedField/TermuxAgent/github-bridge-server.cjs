'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { URL } = require('node:url');
const github = require('./github.cjs');
const githubWrite = require('./github-write.cjs');
const { resolveTrustedApproval } = require('../FieldCore/trusted-approval.cjs');
const { createApprovalVerifierFromEnv } = require('../FieldCore/ed25519-approval-broker.cjs');
const { createTaskRecord } = require('../FieldCore/shared-task-contract.cjs');

const HOST = '127.0.0.1';
const PORT = 18798;
const API = 'https://api.github.com';
const DEFAULT_AUDIT = path.join(process.env.LOCALAPPDATA || os.homedir(), 'HeavenzFire', 'UnifiedField', 'github-bridge-audit.jsonl');
const DEFAULT_INBOX = 'http://127.0.0.1:18796';
const DEFAULT_ORCHESTRATOR = 'http://127.0.0.1:18797';
const MAX_BODY = 1_100_000;
const ORCHESTRATOR_TIMEOUT_MS = 180000;
const MAX_AUDIT_MEMORY_EVENTS = 500;
const MAX_TASK_RESULT_CACHE_ENTRIES = 100;
const MAX_TASK_RESULT_CACHE_BYTES = 1_000_000;

function send(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

async function bodyJson(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw Object.assign(new Error('content_type_must_be_application_json'), { statusCode: 415 });
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('request_body_too_large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('invalid_json'), { statusCode: 400 }); }
}

function safeIdempotencyKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{12,128}$/.test(value)) {
    throw Object.assign(new Error('idempotencyKey must be 12-128 safe characters'), { statusCode: 400 });
  }
  return value;
}

function createGitHubBridgeServer(options = {}) {
  const host = options.host || HOST;
  if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') throw new Error('github_bridge_must_bind_loopback');
  const port = options.port ?? PORT;
  const auditPath = options.auditPath || DEFAULT_AUDIT;
  const inboxUrl = options.inboxUrl || DEFAULT_INBOX;
  const orchestratorUrl = options.orchestratorUrl || DEFAULT_ORCHESTRATOR;
  const fetchImpl = options.fetchImpl || fetch;
  const readApi = options.readApi || github;
  const writeApi = options.writeApi || githubWrite;
  const approvalVerifier = typeof options.approvalVerifier === 'function' ? options.approvalVerifier : null;
  const readAuthVerifier = typeof options.readAuthVerifier === 'function' ? options.readAuthVerifier : null;
  const tokenProvider = options.tokenProvider || (() => execFileSync('gh', ['auth', 'token', '--hostname', 'github.com'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim());
  const ownerConfig = options.allowedOwners || process.env.HF_GITHUB_OWNERS || 'HeavenzFire';
  const allowedOwners = new Set((Array.isArray(ownerConfig) ? ownerConfig : String(ownerConfig).split(',')).map(x => String(x).trim().toLowerCase()).filter(Boolean));
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });

  const audit = [];
  const idempotency = new Map();
  const taskLinks = new Map();
  const taskRuns = new Map();
  const taskResults = new Map();
  let taskResultCacheBytes = 0;
  let auditTotalEvents = 0;

  async function requireReadAuthorization(req, resource) {
    if (!readAuthVerifier) {
      throw Object.assign(new Error('local_read_authenticator_not_configured'), { statusCode: 503 });
    }
    let decision;
    try {
      decision = await readAuthVerifier({
        resource,
        method: req.method,
        path: new URL(req.url, 'http://' + host).pathname,
        authorization: req.headers.authorization || null
      });
    } catch {
      throw Object.assign(new Error('local_read_authorization_denied'), { statusCode: 403 });
    }
    if (!decision || decision.authorized !== true ||
        typeof decision.principal !== 'string' || !decision.principal.trim()) {
      throw Object.assign(new Error('local_read_authorization_denied'), { statusCode: 403 });
    }
    return decision.principal;
  }

  function rememberAudit(record) {
    audit.push(record);
    if (audit.length > MAX_AUDIT_MEMORY_EVENTS) {
      audit.splice(0, audit.length - MAX_AUDIT_MEMORY_EVENTS);
    }
  }

  function rememberTaskResult(taskId, result) {
    if (typeof taskId !== 'string') return;
    let encoded;
    try { encoded = JSON.stringify(result); } catch { return; }
    if (encoded === undefined) return;
    const bytes = Buffer.byteLength(encoded, 'utf8');
    if (bytes > MAX_TASK_RESULT_CACHE_BYTES) return;
    if (taskResults.has(taskId)) {
      taskResultCacheBytes -= taskResults.get(taskId).bytes;
      taskResults.delete(taskId);
    }
    taskResults.set(taskId, { value: result, bytes });
    taskResultCacheBytes += bytes;
    while (taskResults.size > MAX_TASK_RESULT_CACHE_ENTRIES ||
           taskResultCacheBytes > MAX_TASK_RESULT_CACHE_BYTES) {
      const oldest = taskResults.keys().next().value;
      const removed = taskResults.get(oldest);
      taskResultCacheBytes -= removed.bytes;
      taskResults.delete(oldest);
    }
  }

  function sanitizeAuditEvent(event) {
    const record = { ...event };
    if (record.type === 'task_submitted') {
      if (typeof record.goal === 'string') {
        record.goalBytes = Buffer.byteLength(record.goal, 'utf8');
        if (typeof record.goalHash !== 'string' || !/^[a-f0-9]{64}$/i.test(record.goalHash)) {
          record.goalHash = crypto.createHash('sha256').update(record.goal, 'utf8').digest('hex');
        }
      }
      delete record.goal;
      delete record.inbox;
    }
    if (record.type === 'task_execution_completed' &&
        Object.prototype.hasOwnProperty.call(record, 'result')) {
      const encoded = JSON.stringify(record.result);
      if (encoded !== undefined) {
        record.resultBytes = Buffer.byteLength(encoded, 'utf8');
        record.resultSha256 = crypto.createHash('sha256').update(encoded, 'utf8').digest('hex');
      }
      delete record.result;
    }
    return record;
  }

  function indexAuditEvent(event) {
    if (event.idempotencyKey) idempotency.set(event.idempotencyKey, event);
    if (event.type === 'task_submitted') {
      taskLinks.set(event.taskId, { taskId: event.taskId, goalHash: event.goalHash });
    }
    if (event.type === 'task_execution_started' ||
        event.type === 'task_execution_completed' ||
        event.type === 'task_execution_failed') {
      taskRuns.set(event.taskId, event);
    }
  }

  if (fs.existsSync(auditPath)) {
    for (const line of fs.readFileSync(auditPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
      const rawEvent = JSON.parse(line);
      // Legacy completion results are never rehydrated into the unauthenticated
      // process-local replay cache. A post-restart replay must fail closed.
      const event = sanitizeAuditEvent(rawEvent);
      auditTotalEvents++;
      rememberAudit(event);
      indexAuditEvent(event);
    }
  }

  function append(event) {
    if (event.type === 'task_execution_completed' &&
        Object.prototype.hasOwnProperty.call(event, 'result')) {
      rememberTaskResult(event.taskId, event.result);
    }
    const record = { timestamp: new Date().toISOString(), ...sanitizeAuditEvent(event) };
    const fd = fs.openSync(auditPath, 'a');
    try { fs.writeSync(fd, JSON.stringify(record) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    auditTotalEvents++;
    rememberAudit(record);
    indexAuditEvent(record);
    return record;
  }

  function validateRepo(repo) {
    github.validateRepo(repo);
    const owner = repo.split('/')[0].toLowerCase();
    if (!allowedOwners.has(owner)) throw Object.assign(new Error('repository_owner_not_allowed'), { statusCode: 403 });
    return repo;
  }

  function getToken() {
    const token = tokenProvider();
    if (typeof token !== 'string' || token.length < 20 || /\s/.test(token)) throw new Error('github_cli_auth_unavailable');
    return token;
  }

  async function githubRequest(method, route, payload, token) {
    if (!route.startsWith('/repos/') || route.includes('..') || route.includes('\\')) throw new Error('invalid_github_route');
    const response = await fetchImpl(API + route, {
      method, redirect: 'error',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'HeavenzFire-UnifiedField-Bridge'
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });
    const text = await response.text();
    if (text.length > 1_000_000) throw new Error('github_response_too_large');
    let data = {};
    if (text) { try { data = JSON.parse(text); } catch { throw new Error('github_invalid_json'); } }
    if (!response.ok) {
      const error = new Error('github_http_' + response.status + (data.message ? ':' + data.message : ''));
      error.statusCode = response.status === 404 ? 404 : response.status === 422 ? 422 : 502;
      throw error;
    }
    return data;
  }

  async function writeOnce(input, action, operation) {
    const key = safeIdempotencyKey(input.idempotencyKey);
    const fingerprintInput = { ...input, approval: undefined, approvalEvidence: undefined };
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ action, input: fingerprintInput })).digest('hex');
    const prior = idempotency.get(key);
    if (prior && prior.fingerprint !== fingerprint) throw Object.assign(new Error('idempotency_key_conflict'), { statusCode: 409 });
    // A matching completed operation is a replay of an already-authorized write.
    // Return its durable result before verifying the one-time approval envelope again.
    if (prior) {
      if (prior.type === 'write_completed') return { ...prior.result, idempotentReplay: true };
      throw Object.assign(new Error('idempotency_key_in_progress_or_outcome_unknown'), { statusCode: 409 });
    }
    const approval = await resolveTrustedApproval({ verifier: approvalVerifier, action, subject: { fingerprint }, evidence: input.approvalEvidence });
    append({ type: 'write_started', action, idempotencyKey: key, fingerprint, approval });
    try {
      const result = await operation();
      append({ type: 'write_completed', action, idempotencyKey: key, fingerprint, approval, result });
      return result;
    } catch (error) {
      append({ type: 'write_failed', action, idempotencyKey: key, fingerprint, approval, error: String(error.message || error).slice(0, 500) });
      throw error;
    }
  }

  async function remoteJson(url, method, payload, timeoutMs = 20000) {
    const response = await fetchImpl(url, {
      method, redirect: 'error',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await response.text();
    let data = {};
    if (text) { try { data = JSON.parse(text); } catch { throw new Error('local_service_invalid_json'); } }
    if (!response.ok) throw Object.assign(new Error('local_service_http_' + response.status + ':' + (data.error || 'request_failed')), { statusCode: response.status });
    return data;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const expectedPort = server.address()?.port || port;
      const requestHost = String(req.headers.host || '').toLowerCase();
      if (![('127.0.0.1:' + expectedPort), ('localhost:' + expectedPort), ('[::1]:' + expectedPort)].includes(requestHost)) return send(res, 403, { ok: false, error: 'invalid_host_header' });
      const url = new URL(req.url, 'http://' + host);
      if (req.method === 'GET' && url.pathname === '/health') {
        let auth = 'unverified';
        try { getToken(); auth = 'github-cli-authenticated'; } catch { auth = 'github-cli-auth-missing'; }
        const approvalVerifierConfigured = typeof approvalVerifier === 'function';
        const capabilities = ['repository-read', 'issues-read', 'pull-requests-read', 'commits-read', 'files-read', 'task-proposals', 'durable-audit', 'idempotency'];
        if (approvalVerifierConfigured) capabilities.push('issues-write', 'pull-requests-write', 'feature-branches', 'branch-file-commits', 'task-execution');
        return send(res, 200, {
          ok: true, service: 'heavenzfire-unified-field-github-bridge',
          host, port: server.address()?.port || port,
          githubAuth: auth, allowedOwners: [...allowedOwners],
          approvalVerifierConfigured, writesEnabled: approvalVerifierConfigured,
          localReadAuthenticatorConfigured: typeof readAuthVerifier === 'function', capabilities,
          defaultBranchWrites: false, merges: false,
          auditEvents: auditTotalEvents, recentAuditEvents: audit.length
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/tasks') {
        const input = await bodyJson(req);
        if (typeof input.goal !== 'string' || !input.goal.trim() || input.goal.length > 12000) throw Object.assign(new Error('goal_required_max_12000'), { statusCode: 400 });
        const task = createTaskRecord({ taskId: input.taskId, source: input.source || 'github-bridge', goal: input.goal, metadata: input.metadata || {} });
        const inbox = await remoteJson(inboxUrl + '/api/tasks', 'POST', { taskRecord: task });
        append({
          type: 'task_submitted',
          taskId: task.taskId,
          goalHash: crypto.createHash('sha256').update(task.goal, 'utf8').digest('hex'),
          goalBytes: Buffer.byteLength(task.goal, 'utf8'),
          inboxAccepted: inbox?.ok === true
        });
        return send(res, 201, { ok: true, taskId: task.taskId, status: 'proposed', approvalState: 'pending', inbox });
      }

      const taskLookup = url.pathname.match(/^\/api\/tasks\/([0-9a-f-]{36})$/);
      if (req.method === 'GET' && taskLookup) {
        await requireReadAuthorization(req, 'task-record');
        const inbox = await remoteJson(inboxUrl + '/api/tasks/' + taskLookup[1], 'GET');
        return send(res, 200, { ok: true, taskRecord: inbox.taskRecord, execution: taskRuns.get(taskLookup[1]) || null });
      }
      const taskRun = url.pathname.match(/^\/api\/tasks\/([0-9a-f-]{36})\/run$/);
      if (req.method === 'POST' && taskRun) {
        const input = await bodyJson(req);
        const taskEvent = taskLinks.get(taskRun[1]);
        if (!taskEvent) throw Object.assign(new Error('task_not_found_in_bridge_ledger'), { statusCode: 404 });
        if (!/^[a-f0-9]{64}$/i.test(taskEvent.goalHash || '')) {
          throw Object.assign(new Error('task_goal_hash_missing_from_bridge_audit'), { statusCode: 409 });
        }
        const approvalContext = { taskId: taskRun[1], goalHash: taskEvent.goalHash };
        const priorRun = taskRuns.get(taskRun[1]);
        // A completed task is a read-only replay of an already-authorized result.
        // Raw results are retained only in a bounded process-local cache, never in
        // new durable bridge audit records.
        if (priorRun?.type === 'task_execution_completed') {
          await requireReadAuthorization(req, 'task-result-replay');
          const cached = taskResults.get(taskRun[1]);
          if (cached) return send(res, 200, { ok: true, idempotentReplay: true, result: cached.value });
          return send(res, 409, {
            ok: false,
            error: 'task_completed_result_not_cached',
            taskId: taskRun[1],
            orchestratorTaskId: priorRun.orchestratorTaskId || null,
            resultSha256: priorRun.resultSha256 || null
          });
        }
        if (priorRun?.type === 'task_execution_started' || priorRun?.type === 'task_execution_failed') {
          throw Object.assign(new Error('task_execution_in_progress_or_outcome_unknown; inspect orchestrator task ' + (priorRun.orchestratorTaskId || 'unknown') + ' before retrying'), { statusCode: 409 });
        }
        const inboxResponse = await remoteJson(inboxUrl + '/api/tasks/' + taskRun[1], 'GET');
        const taskRecord = inboxResponse && inboxResponse.taskRecord;
        if (!taskRecord || taskRecord.taskId !== taskRun[1] ||
            typeof taskRecord.goal !== 'string' || !taskRecord.goal.trim()) {
          throw Object.assign(new Error('authoritative_inbox_task_record_unavailable'), { statusCode: 409 });
        }
        const actualGoalHash = crypto.createHash('sha256').update(taskRecord.goal, 'utf8').digest('hex');
        if (actualGoalHash !== taskEvent.goalHash) {
          throw Object.assign(new Error('authoritative_inbox_task_goal_hash_mismatch'), { statusCode: 409 });
        }
        const approval = await resolveTrustedApproval({ verifier: approvalVerifier, action: 'execute_task', subject: approvalContext, evidence: input.approvalEvidence });
        const created = await remoteJson(orchestratorUrl + '/api/tasks', 'POST', { taskId: taskRun[1], goal: taskRecord.goal });
        const orchestratorTaskId = created.task?.id;
        if (!orchestratorTaskId) throw new Error('orchestrator_task_creation_failed');
        if (orchestratorTaskId !== taskRun[1]) throw Object.assign(new Error('orchestrator_task_id_binding_mismatch'), { statusCode: 502 });
        await remoteJson(orchestratorUrl + '/api/tasks/' + orchestratorTaskId + '/approve', 'POST', { approve: true, approvalEvidence: input.approvalEvidence, approvalContext });
        append({ type: 'task_execution_started', taskId: taskRun[1], orchestratorTaskId, approval });
        const result = await remoteJson(orchestratorUrl + '/api/tasks/' + orchestratorTaskId + '/run', 'POST', {}, options.orchestratorTimeoutMs || ORCHESTRATOR_TIMEOUT_MS);
        append({ type: 'task_execution_completed', taskId: taskRun[1], orchestratorTaskId, approval, result });
        return send(res, 200, { ok: true, taskId: taskRun[1], orchestratorTaskId, result });
      }

      if (req.method === 'GET' && url.pathname === '/api/github/repository') {
        const repo = validateRepo(url.searchParams.get('repo') || 'HeavenzFire/HeavenzFire');
        const token = getToken();
        return send(res, 200, await readApi.getRepository(repo, { token, fetchImpl }));
      }
      if (req.method === 'GET' && url.pathname === '/api/github/issues') {
        const repo = validateRepo(url.searchParams.get('repo') || 'HeavenzFire/HeavenzFire');
        const state = url.searchParams.get('state') || 'open';
        const token = getToken();
        return send(res, 200, await readApi.listIssues(repo, { token, state, fetchImpl }));
      }
      if (req.method === 'GET' && url.pathname === '/api/github/pulls') {
        const repo = validateRepo(url.searchParams.get('repo') || 'HeavenzFire/HeavenzFire');
        const state = url.searchParams.get('state') || 'open';
        const token = getToken();
        return send(res, 200, await readApi.listPullRequests(repo, { token, state, fetchImpl }));
      }
      if (req.method === 'GET' && url.pathname === '/api/github/commits') {
        const repo = validateRepo(url.searchParams.get('repo') || 'HeavenzFire/HeavenzFire');
        const token = getToken();
        return send(res, 200, await readApi.listCommits(repo, { token, fetchImpl }));
      }
      if (req.method === 'GET' && url.pathname === '/api/github/files') {
        const repo = validateRepo(url.searchParams.get('repo') || 'HeavenzFire/HeavenzFire');
        const filePath = url.searchParams.get('path');
        if (!filePath) throw Object.assign(new Error('path_required'), { statusCode: 400 });
        const token = getToken();
        return send(res, 200, await readApi.getFile(repo, filePath, { token, fetchImpl }));
      }

      const input = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await bodyJson(req) : {};
      if (req.method === 'POST' && url.pathname === '/api/github/branches') {
        const repo = validateRepo(input.repo || 'HeavenzFire/HeavenzFire');
        const result = await writeOnce(input, 'create_feature_branch', () =>
          writeApi.createFeatureBranch(repo, input.branch, { token: getToken(), writeEnabled: true, fetchImpl }));
        return send(res, 201, { ok: true, ...result });
      }
      if (req.method === 'PUT' && url.pathname === '/api/github/files') {
        const repo = validateRepo(input.repo || 'HeavenzFire/HeavenzFire');
        const result = await writeOnce(input, 'commit_file_to_feature_branch', () =>
          writeApi.writeFile(repo, input.branch, input.path, input.content, input.message, { token: getToken(), writeEnabled: true, fetchImpl }));
        return send(res, 200, { ok: true, ...result });
      }
      if (req.method === 'POST' && url.pathname === '/api/github/pulls') {
        const repo = validateRepo(input.repo || 'HeavenzFire/HeavenzFire');
        const result = await writeOnce(input, 'open_draft_pull_request', () =>
          writeApi.openPullRequest(repo, input.branch, input.title, input.body, { token: getToken(), writeEnabled: true, fetchImpl }));
        return send(res, 201, { ok: true, ...result });
      }
      if (req.method === 'POST' && url.pathname === '/api/github/issues') {
        const repo = validateRepo(input.repo || 'HeavenzFire/HeavenzFire');
        if (typeof input.title !== 'string' || !input.title.trim()) throw Object.assign(new Error('issue_title_required'), { statusCode: 400 });
        const result = await writeOnce(input, 'create_issue', async () => {
          const token = getToken();
          const data = await githubRequest('POST', '/repos/' + repo + '/issues', { title: input.title, body: String(input.body || ''), ...(Array.isArray(input.labels) ? { labels: input.labels } : {}) }, token);
          return { number: data.number, url: data.html_url, state: data.state };
        });
        return send(res, 201, { ok: true, ...result });
      }

      const issuePatch = url.pathname.match(/^\/api\/github\/issues\/(\d+)$/);
      if (req.method === 'PATCH' && issuePatch) {
        const repo = validateRepo(input.repo || 'HeavenzFire/HeavenzFire');
        const payload = {};
        for (const key of ['title', 'body', 'state', 'labels', 'assignees', 'milestone']) if (input[key] !== undefined) payload[key] = input[key];
        if (!Object.keys(payload).length) throw Object.assign(new Error('issue_update_fields_required'), { statusCode: 400 });
        if (payload.state && !['open', 'closed'].includes(payload.state)) throw Object.assign(new Error('issue_state_must_be_open_or_closed'), { statusCode: 400 });
        const result = await writeOnce(input, 'update_issue', async () => {
          const data = await githubRequest('PATCH', '/repos/' + repo + '/issues/' + issuePatch[1], payload, getToken());
          return { number: data.number, url: data.html_url, state: data.state, title: data.title };
        });
        return send(res, 200, { ok: true, ...result });
      }

      const issueComment = url.pathname.match(/^\/api\/github\/issues\/(\d+)\/comments$/);
      if (req.method === 'POST' && issueComment) {
        const repo = validateRepo(input.repo || 'HeavenzFire/HeavenzFire');
        if (typeof input.body !== 'string' || !input.body.trim()) throw Object.assign(new Error('comment_body_required'), { statusCode: 400 });
        const result = await writeOnce(input, 'create_issue_comment', async () => {
          const data = await githubRequest('POST', '/repos/' + repo + '/issues/' + issueComment[1] + '/comments', { body: input.body }, getToken());
          return { id: data.id, url: data.html_url };
        });
        return send(res, 201, { ok: true, ...result });
      }

      const pullPatch = url.pathname.match(/^\/api\/github\/pulls\/(\d+)$/);
      if (req.method === 'PATCH' && pullPatch) {
        const repo = validateRepo(input.repo || 'HeavenzFire/HeavenzFire');
        const payload = {};
        for (const key of ['title', 'body', 'state', 'base']) if (input[key] !== undefined) payload[key] = input[key];
        if (!Object.keys(payload).length) throw Object.assign(new Error('pull_update_fields_required'), { statusCode: 400 });
        if (payload.state && !['open', 'closed'].includes(payload.state)) throw Object.assign(new Error('pull_state_must_be_open_or_closed'), { statusCode: 400 });
        const result = await writeOnce(input, 'update_pull_request', async () => {
          const data = await githubRequest('PATCH', '/repos/' + repo + '/pulls/' + pullPatch[1], payload, getToken());
          return { number: data.number, url: data.html_url, state: data.state, title: data.title };
        });
        return send(res, 200, { ok: true, ...result });
      }

      if (req.method === 'GET' && url.pathname === '/api/audit/recent') {
        await requireReadAuthorization(req, 'audit-recent');
        return send(res, 200, {
          events: audit.slice(-100).map(({
            timestamp, type, action, taskId, idempotencyKey, error, result,
            goalHash, goalBytes, inboxAccepted, resultSha256, resultBytes
          }) => ({
            timestamp, type, action, taskId, idempotencyKey, error, result,
            goalHash, goalBytes, inboxAccepted, resultSha256, resultBytes
          }))
        });
      }
      return send(res, 404, { ok: false, error: 'not_found' });
    } catch (error) {
      return send(res, error.statusCode || 500, { ok: false, error: String(error.message || error).slice(0, 700) });
    }
  });
  return server;
}

if (require.main === module) {
  const port = Number(process.env.HF_GITHUB_BRIDGE_PORT || PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('HF_GITHUB_BRIDGE_PORT_invalid');
  const approvalVerifier = createApprovalVerifierFromEnv({ serviceId: 'github-bridge' });
  const server = createGitHubBridgeServer({ port, approvalVerifier });
  server.listen(port, HOST, () => process.stdout.write('HeavenzFire GitHub bridge listening on http://' + HOST + ':' + port + '\n'));
}

module.exports = { createGitHubBridgeServer, safeIdempotencyKey, HOST, PORT, DEFAULT_AUDIT, ORCHESTRATOR_TIMEOUT_MS };