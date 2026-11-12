'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createGitHubBridgeServer, createBearerTokenAuthorizer, ORCHESTRATOR_TIMEOUT_MS } = require('./github-bridge-server.cjs');

const TEST_APPROVAL_EVIDENCE = Object.freeze({ fixture: 'trusted-human-approval-test' });
async function testApprovalVerifier({ action, subject, evidence }) {
  if (!evidence || evidence.fixture !== TEST_APPROVAL_EVIDENCE.fixture || !subject || typeof subject !== 'object') throw new Error('test_approval_evidence_invalid');
  return { approved: true, approvalId: 'test-approval-' + String(subject.taskId || subject.fingerprint || action), approvedBy: 'verified-test-operator', reason: 'Deterministic test approval fixture.', method: 'injected-test-verifier', verifiedAt: '2026-11-05T08:00:00.000Z' };
}
test('orchestrator task requests allow full 16-role execution window', () => { assert.equal(ORCHESTRATOR_TIMEOUT_MS, 180000); });

test('production bearer authorization requires the explicit Bearer scheme and a single token', () => {
  const token = '0123456789abcdef0123456789abcdef';
  const authorize = createBearerTokenAuthorizer(token);
  assert.equal(authorize({ headers: { authorization: 'Bearer ' + token } }), true);
  assert.equal(authorize({ headers: { authorization: 'bearer ' + token } }), true);
  assert.equal(authorize({ headers: { authorization: token } }), false);
  assert.equal(authorize({ headers: { authorization: 'Basic ' + token } }), false);
  assert.equal(authorize({ headers: { authorization: 'Bearer ' + token + ' extra' } }), false);
  assert.equal(authorize({ headers: {} }), false);
  assert.equal(createBearerTokenAuthorizer('short')({ headers: { authorization: 'Bearer short' } }), false);
});


async function withServer(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-gh-bridge-'));
  const auditPath = path.join(dir, 'audit.jsonl');
  const { initialAuditEvents, ...serverOptions } = options;
  if (Array.isArray(initialAuditEvents)) {
    fs.writeFileSync(auditPath, initialAuditEvents.map(event => JSON.stringify(event)).join('\n') + '\n', 'utf8');
  }
  const createServer = () => createGitHubBridgeServer({
    port: 0, auditPath,
    tokenProvider: () => 'test-token-that-is-long-enough',
    allowedOwners: ['HeavenzFire'],
    approvalVerifier: testApprovalVerifier,
    readAuthorizer: () => true,
    inboxReadToken: 'test-inbox-read-token-that-is-at-least-32-chars',
    orchestratorResultReadToken: 'test-orchestrator-result-read-token-32chars',
    ...serverOptions
  });
  let server = createServer();
  const listen = async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return 'http://127.0.0.1:' + server.address().port;
  };
  const close = async () => {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  };
  let base = await listen();
  const restart = async () => {
    await close();
    server = createServer();
    base = await listen();
    return base;
  };
  t.after(async () => {
    await close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { base, auditPath, restart };
}

test('bridge binds loopback only', () => {
  assert.throws(() => createGitHubBridgeServer({ host: '0.0.0.0', auditPath: path.join(os.tmpdir(), 'hf-no-write', 'audit.jsonl') }), /loopback/);
});

test('health reports verifier-backed write capability state', async t => {
  const { base } = await withServer(t);
  const r = await fetch(base + '/health');
  const data = await r.json();
  assert.equal(r.status, 200);
  assert.equal(data.githubAuth, 'github-cli-authenticated');
  assert.equal(data.approvalVerifierConfigured, true);
  assert.equal(data.writesEnabled, true);
  assert.equal(data.defaultBranchWrites, false);
  assert.ok(data.capabilities.includes('issues-write'));
});

test('self-asserted approval JSON cannot authorize a write without a trusted verifier', async t => {
  const { base } = await withServer(t, { approvalVerifier: null });
  const health = await (await fetch(base + '/health')).json();
  assert.equal(health.approvalVerifierConfigured, false);
  assert.equal(health.writesEnabled, false);
  assert.ok(!health.capabilities.includes('issues-write'));
  const r = await fetch(base + '/api/github/issues', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'test', idempotencyKey: 'approval-test-001', approval: { approved: true, approvedBy: 'operator', reason: 'self-asserted' } }) });
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /trusted_approval_verifier_not_configured/);
});

test('write action uses real branch adapter with durable idempotency and audit', async t => {
  const calls = [];
  const writeApi = {
    async createFeatureBranch(repo, branch, options) {
      calls.push({ repo, branch, token: options.token, writeEnabled: options.writeEnabled });
      return { branch, base: 'main', sha: 'abc123' };
    }
  };
  let approvalCalls = 0;
  const approvalVerifier = async input => {
    if (!input.evidence) throw new Error('test_approval_evidence_required');
    approvalCalls += 1;
    if (approvalCalls > 1) throw new Error('approval_replay_rejected');
    return testApprovalVerifier(input);
  };
  const { base, auditPath } = await withServer(t, { writeApi, approvalVerifier });
  const input = {
    repo: 'HeavenzFire/HeavenzFire', branch: 'hf-agent/bridge-test',
    idempotencyKey: 'branch-create-0001',
    approvalEvidence: TEST_APPROVAL_EVIDENCE,
    approval: { approved: true, approvedBy: 'attacker-claimed-operator', reason: 'untrusted request fields' }
  };
  const first = await fetch(base + '/api/github/branches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(first.status, 201);
  assert.equal((await first.json()).sha, 'abc123');
  const replay = await fetch(base + '/api/github/branches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(replay.status, 201);
  const replayBody = await replay.json();
  assert.equal(replayBody.idempotentReplay, true);
  assert.equal(approvalCalls, 1, 'completed write replay must not consume the one-time approval twice');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].writeEnabled, true);
  const events = fs.readFileSync(auditPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert.deepEqual(events.map(x => x.type), ['write_started', 'write_completed']);
  assert.equal(events[0].approval.approvedBy, 'verified-test-operator');
  assert.equal(events[0].approval.method, 'injected-test-verifier');
  assert.ok(events[0].approval.evidenceSha256);
  assert.ok(!fs.readFileSync(auditPath, 'utf8').includes('attacker-claimed-operator'));
  assert.ok(!fs.readFileSync(auditPath, 'utf8').includes('test-token'));
});

test('repository allowlist blocks other owners', async t => {
  const { base } = await withServer(t);
  const r = await fetch(base + '/api/github/repository?repo=other/repo');
  assert.equal(r.status, 403);
});


test('sensitive task and audit routes fail closed without an authenticated reader', async t => {
  let upstreamCalls = 0;
  const { base } = await withServer(t, {
    readAuthorizer: () => false,
    fetchImpl: async () => { upstreamCalls++; return new Response('{}', { status: 200 }); }
  });
  const taskId = '00000000-0000-4000-8000-000000000111';
  const requests = [
    fetch(base + '/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'private task' }) }),
    fetch(base + '/api/tasks/' + taskId),
    fetch(base + '/api/tasks/' + taskId + '/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
    fetch(base + '/api/audit/recent')
  ];
  for (const response of await Promise.all(requests)) {
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'bridge_read_authorization_required');
  }
  assert.equal(upstreamCalls, 0, 'unauthorized requests must not reach inbox or orchestrator services');
});

test('task intake minimizes durable audit data and keeps replay results bounded to process memory', async t => {
  const calls = [];
  let storedTaskRecord = null;
  let orchestratorCreated = false;
  const goalSentinel = 'PRIVATE_GOAL_SENTINEL_20261110';
  const resultSentinel = 'PRIVATE_RESULT_SENTINEL_20261110';
  const fetchImpl = async (url, init = {}) => {
    if (url === 'http://127.0.0.1:18797/health') return new Response(JSON.stringify({ ok: true, taskStateLookup: true }), { status: 200 });
    calls.push({ url, method: init.method, headers: init.headers, body: init.body && JSON.parse(init.body) });
    if (url === 'http://127.0.0.1:18796/api/tasks' && init.method === 'POST') {
      storedTaskRecord = calls.at(-1).body.taskRecord;
      return new Response(JSON.stringify({ ok: true, taskId: storedTaskRecord.taskId }), { status: 201 });
    }
    if (url.startsWith('http://127.0.0.1:18796/api/tasks/')) {
      return storedTaskRecord
        ? new Response(JSON.stringify({ ok: true, taskRecord: storedTaskRecord }), { status: 200 })
        : new Response('{}', { status: 404 });
    }
    if (url === 'http://127.0.0.1:18797/api/tasks/' + storedTaskRecord.taskId + '/state') {
      if (!orchestratorCreated) return new Response(JSON.stringify({ error: 'task_not_found' }), { status: 404 });
      return new Response(JSON.stringify({ task: {
        id: storedTaskRecord.taskId, state: 'proposed',
        goalHash: require('node:crypto').createHash('sha256').update(storedTaskRecord.goal, 'utf8').digest('hex')
      } }), { status: 200 });
    }
    if (url === 'http://127.0.0.1:18797/api/tasks') {
      orchestratorCreated = true;
      return new Response(JSON.stringify({ task: { id: calls.at(-1).body.taskId, state: 'proposed' } }), { status: 201 });
    }
    if (url.endsWith('/approve')) return new Response(JSON.stringify({ task: { state: 'approved' } }), { status: 200 });
    if (url.endsWith('/run')) return new Response(JSON.stringify({
      task: { state: 'completed' }, completedRoles: 16, failedRoles: 0, privateResult: resultSentinel
    }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  let approvalCalls = 0;
  const approvalVerifier = async input => {
    if (!input.evidence) throw new Error('test_approval_evidence_required');
    approvalCalls += 1;
    if (approvalCalls > 1) throw new Error('approval_replay_rejected');
    return testApprovalVerifier(input);
  };
  const { base, auditPath } = await withServer(t, { fetchImpl, approvalVerifier });
  const submitted = await fetch(base + '/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: goalSentinel }) });
  assert.equal(submitted.status, 201);
  const task = await submitted.json();
  const denied = await fetch(base + '/api/tasks/' + task.taskId + '/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(denied.status, 403);
  const run = await fetch(base + '/api/tasks/' + task.taskId + '/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approvalEvidence: TEST_APPROVAL_EVIDENCE }) });
  assert.equal(run.status, 200);
  const runResult = await run.json();
  assert.equal(runResult.result.completedRoles, 16);
  const inboxRead = calls.find(call => call.url === 'http://127.0.0.1:18796/api/tasks/' + task.taskId && call.method === 'GET');
  assert.equal(inboxRead.headers.authorization, 'Bearer test-inbox-read-token-that-is-at-least-32-chars');
  const replay = await fetch(base + '/api/tasks/' + task.taskId + '/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approvalEvidence: TEST_APPROVAL_EVIDENCE }) });
  assert.equal(replay.status, 200);
  const replayResult = await replay.json();
  assert.equal(replayResult.idempotentReplay, true);
  assert.deepEqual(replayResult.result, runResult.result);
  assert.equal(approvalCalls, 1, 'completed replay must not consume the one-time approval twice');
  assert.ok(calls.some(x => x.url === 'http://127.0.0.1:18796/api/tasks'));
  assert.ok(calls.some(x => x.url === 'http://127.0.0.1:18796/api/tasks/' + task.taskId));
  const orchestratorCreate = calls.find(x => x.url === 'http://127.0.0.1:18797/api/tasks');
  assert.equal(orchestratorCreate.headers.authorization, undefined, 'inbox read credential must not be forwarded to the orchestrator');
  const inboxWrite = calls.find(x => x.url === 'http://127.0.0.1:18796/api/tasks' && x.method === 'POST');
  assert.equal(inboxWrite.headers.authorization, undefined, 'inbox read credential must not be sent on task intake');
  assert.equal(orchestratorCreate.body.taskId, task.taskId);
  assert.equal(orchestratorCreate.body.goal, goalSentinel);
  const approvalCall = calls.find(x => x.url.endsWith('/approve'));
  assert.equal(approvalCall.body.approve, true);
  assert.equal(approvalCall.body.approvalContext.taskId, task.taskId);
  assert.equal(calls.find(x => x.url === 'http://127.0.0.1:18797/api/tasks').body.taskId, approvalCall.body.approvalContext.taskId);
  assert.ok(approvalCall.body.approvalContext.goalHash);

  const auditText = fs.readFileSync(auditPath, 'utf8');
  const auditEvents = auditText.trim().split('\n').filter(Boolean).map(JSON.parse);
  const submittedEvent = auditEvents.find(event => event.type === 'task_submitted');
  const completedEvent = auditEvents.find(event => event.type === 'task_execution_completed');
  assert.ok(!auditText.includes(goalSentinel), 'raw task goals must not be written to bridge audit');
  assert.ok(!auditText.includes(resultSentinel), 'raw task results must not be written to bridge audit');
  assert.equal(submittedEvent.goalHash, crypto.createHash('sha256').update(goalSentinel, 'utf8').digest('hex'));
  assert.equal(submittedEvent.goalBytes, Buffer.byteLength(goalSentinel, 'utf8'));
  assert.equal(Object.prototype.hasOwnProperty.call(submittedEvent, 'goal'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(submittedEvent, 'inbox'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(completedEvent, 'result'), false);
  assert.equal(completedEvent.resultSha256, crypto.createHash('sha256').update(JSON.stringify(runResult.result), 'utf8').digest('hex'));
  assert.equal(completedEvent.resultBytes, Buffer.byteLength(JSON.stringify(runResult.result), 'utf8'));

  const restarted = createGitHubBridgeServer({
    port: 0, auditPath, tokenProvider: () => 'test-token-that-is-long-enough',
    allowedOwners: ['HeavenzFire'], approvalVerifier, readAuthorizer: () => true, fetchImpl
  });
  await new Promise(resolve => restarted.listen(0, '127.0.0.1', resolve));
  try {
    const replayAfterRestart = await fetch('http://127.0.0.1:' + restarted.address().port + '/api/tasks/' + task.taskId + '/run', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ approvalEvidence: TEST_APPROVAL_EVIDENCE })
    });
    assert.equal(replayAfterRestart.status, 503);
    const restartBody = await replayAfterRestart.json();
    assert.equal(restartBody.error, 'task_completed_result_read_unavailable');
    assert.equal(restartBody.resultSha256, completedEvent.resultSha256);
    assert.ok(!JSON.stringify(restartBody).includes(resultSentinel));
  } finally {
    await new Promise(resolve => restarted.close(resolve));
  }
});



test('task intake is idempotent for a stable task UUID and rejects conflicting reuse', async t => {
  const taskId = '00000000-0000-4000-8000-000000000777';
  let storedTaskRecord = null;
  let inboxPosts = 0;
  const fetchImpl = async (url, init = {}) => {
    if (url === 'http://127.0.0.1:18796/api/tasks' && init.method === 'POST') {
      inboxPosts++;
      storedTaskRecord = JSON.parse(init.body).taskRecord;
      return new Response(JSON.stringify({ ok: true, taskId }), { status: 201 });
    }
    if (url === 'http://127.0.0.1:18796/api/tasks/' + taskId) {
      return storedTaskRecord
        ? new Response(JSON.stringify({ ok: true, taskRecord: storedTaskRecord }), { status: 200 })
        : new Response(JSON.stringify({ error: 'task_not_found' }), { status: 404 });
    }
    return new Response('{}', { status: 404 });
  };
  const { base } = await withServer(t, { fetchImpl });
  const submit = (goal, suppliedTaskId = taskId) => fetch(base + '/api/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId: suppliedTaskId, goal })
  });
  const first = await submit('Stable task intake identity', taskId.toUpperCase());
  assert.equal(first.status, 201);
  storedTaskRecord.status = 'approved';
  storedTaskRecord.approvalState = 'approved';
  const replay = await submit('Stable task intake identity');
  assert.equal(replay.status, 200);
  const replayBody = await replay.json();
  assert.equal(replayBody.idempotentReplay, true);
  assert.equal(replayBody.status, 'approved');
  assert.equal(replayBody.approvalState, 'approved');
  assert.equal(inboxPosts, 1, 'same task ID and goal must not create a second inbox record');
  const uppercaseLookup = await fetch(base + '/api/tasks/' + taskId.toUpperCase());
  assert.equal(uppercaseLookup.status, 200);
  assert.equal((await uppercaseLookup.json()).taskRecord.taskId, taskId);
  const conflict = await submit('Different goal under the same task ID');
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error, 'task_id_conflicts_with_different_goal');
  assert.equal(inboxPosts, 1);
});

test('accepted task replay repairs a missing inbox record instead of reporting stale acceptance', async t => {
  const taskId = '00000000-0000-4000-8000-000000000785';
  const goal = 'Recreate an inbox record lost after the bridge audit was fsynced';
  const goalHash = crypto.createHash('sha256').update(goal, 'utf8').digest('hex');
  let storedTaskRecord = null;
  let inboxPosts = 0;
  const fetchImpl = async (url, init = {}) => {
    if (url === 'http://127.0.0.1:18796/api/tasks' && init.method === 'POST') {
      inboxPosts++;
      storedTaskRecord = JSON.parse(init.body).taskRecord;
      return new Response(JSON.stringify({ ok: true, taskId }), { status: 201 });
    }
    if (url === 'http://127.0.0.1:18796/api/tasks/' + taskId) {
      return storedTaskRecord
        ? new Response(JSON.stringify({ ok: true, taskRecord: storedTaskRecord }), { status: 200 })
        : new Response('{}', { status: 404 });
    }
    return new Response('{}', { status: 404 });
  };
  const { base, auditPath } = await withServer(t, {
    fetchImpl,
    initialAuditEvents: [{ type: 'task_submitted', taskId, goalHash, goalBytes: Buffer.byteLength(goal, 'utf8'), inboxAccepted: true }]
  });
  const response = await fetch(base + '/api/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId, goal })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).idempotentReplay, true);
  assert.equal(inboxPosts, 1);
  assert.equal(storedTaskRecord.taskId, taskId);
  const events = fs.readFileSync(auditPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert.ok(events.some(event => event.type === 'task_submission_reserved' && event.reconciledMissingInboxRecord === true));
  assert.ok(events.some(event => event.type === 'task_submitted' && event.taskId === taskId));
});

test('task intake rejects goals larger than the orchestrator execution limit', async t => {
  const { base } = await withServer(t, { fetchImpl: async () => new Response('{}', { status: 404 }) });
  const response = await fetch(base + '/api/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ goal: 'x'.repeat(4001) })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /goal_required_max_4000/);
});

test('bridge refuses task execution before side effects when orchestrator lacks recovery capability', async t => {
  const taskId = '00000000-0000-4000-8000-000000000783';
  let storedTaskRecord = null;
  let orchestratorCreates = 0;
  let approvalCalls = 0;
  const fetchImpl = async (url, init = {}) => {
    if (url === 'http://127.0.0.1:18797/health') return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (url === 'http://127.0.0.1:18796/api/tasks' && init.method === 'POST') {
      storedTaskRecord = JSON.parse(init.body).taskRecord;
      return new Response(JSON.stringify({ ok: true, taskId }), { status: 201 });
    }
    if (url === 'http://127.0.0.1:18796/api/tasks/' + taskId) {
      return storedTaskRecord
        ? new Response(JSON.stringify({ ok: true, taskRecord: storedTaskRecord }), { status: 200 })
        : new Response('{}', { status: 404 });
    }
    if (url === 'http://127.0.0.1:18797/api/tasks' && init.method === 'POST') {
      orchestratorCreates++;
      return new Response('{}', { status: 201 });
    }
    return new Response('{}', { status: 404 });
  };
  const approvalVerifier = async input => {
    approvalCalls++;
    return testApprovalVerifier(input);
  };
  const { base, auditPath } = await withServer(t, { fetchImpl, approvalVerifier });
  const submitted = await fetch(base + '/api/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId, goal: 'Require a recovery-capable orchestrator before execution' })
  });
  assert.equal(submitted.status, 201);
  const response = await fetch(base + '/api/tasks/' + taskId + '/run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approvalEvidence: TEST_APPROVAL_EVIDENCE })
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /task_state_recovery_not_supported/);
  assert.equal(orchestratorCreates, 0);
  assert.equal(approvalCalls, 0, 'capability preflight must happen before consuming human approval');
  const events = fs.readFileSync(auditPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(events.some(event => event.type === 'task_execution_reserved'), false);
});

test('reserved task execution recovers after crash between orchestrator creation and approval', async t => {
  const taskId = '00000000-0000-4000-8000-000000000778';
  let storedTaskRecord = null;
  let orchestratorTask = null;
  let failFirstApproval = true;
  let createCalls = 0;
  let runCalls = 0;
  let bridgeApprovalCalls = 0;
  const oneTimeApprovalVerifier = async input => {
    bridgeApprovalCalls++;
    if (bridgeApprovalCalls > 1) throw new Error('bridge_approval_replay_rejected');
    return testApprovalVerifier(input);
  };
  const fetchImpl = async (url, init = {}) => {
    if (url === 'http://127.0.0.1:18797/health') return new Response(JSON.stringify({ ok: true, taskStateLookup: true }), { status: 200 });
    const body = init.body ? JSON.parse(init.body) : null;
    if (url === 'http://127.0.0.1:18796/api/tasks' && init.method === 'POST') {
      storedTaskRecord = body.taskRecord;
      return new Response(JSON.stringify({ ok: true, taskId }), { status: 201 });
    }
    if (url === 'http://127.0.0.1:18796/api/tasks/' + taskId) {
      return storedTaskRecord
        ? new Response(JSON.stringify({ ok: true, taskRecord: storedTaskRecord }), { status: 200 })
        : new Response('{}', { status: 404 });
    }
    if (url === 'http://127.0.0.1:18797/api/tasks/' + taskId + '/state' && init.method === 'GET') {
      return orchestratorTask
        ? new Response(JSON.stringify({ task: {
            id: orchestratorTask.id, state: orchestratorTask.state,
            goalHash: crypto.createHash('sha256').update(storedTaskRecord.goal, 'utf8').digest('hex')
          } }), { status: 200 })
        : new Response(JSON.stringify({ error: 'task_not_found' }), { status: 404 });
    }
    if (url === 'http://127.0.0.1:18797/api/tasks' && init.method === 'POST') {
      createCalls++;
      orchestratorTask = { id: body.taskId, state: 'proposed' };
      return new Response(JSON.stringify({ task: orchestratorTask }), { status: 201 });
    }
    if (url.endsWith('/approve')) {
      if (failFirstApproval) {
        failFirstApproval = false;
        return new Response(JSON.stringify({ error: 'simulated_interruption' }), { status: 503 });
      }
      orchestratorTask.state = 'approved';
      return new Response(JSON.stringify({ task: orchestratorTask }), { status: 200 });
    }
    if (url.endsWith('/run')) {
      runCalls++;
      orchestratorTask.state = 'completed';
      return new Response(JSON.stringify({ task: orchestratorTask, completedRoles: 16, failedRoles: 0 }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  const { base, auditPath, restart } = await withServer(t, { fetchImpl, approvalVerifier: oneTimeApprovalVerifier });
  const submitted = await fetch(base + '/api/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId, goal: 'Recover an interrupted approved task' })
  });
  assert.equal(submitted.status, 201);
  const run = serverBase => fetch((serverBase || base) + '/api/tasks/' + taskId + '/run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approvalEvidence: TEST_APPROVAL_EVIDENCE })
  });
  const interrupted = await run();
  assert.equal(interrupted.status, 503);
  const eventsAfterInterruption = fs.readFileSync(auditPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert.ok(eventsAfterInterruption.some(event => event.type === 'task_execution_reserved'));
  assert.ok(eventsAfterInterruption.some(event => event.type === 'task_execution_authorized'));
  assert.equal(eventsAfterInterruption.some(event => event.type === 'task_execution_started'), false);
  const reservationText = JSON.stringify(eventsAfterInterruption);
  assert.equal(reservationText.includes('verified-test-operator'), false, 'approver identity must not enter the task audit');
  assert.equal(reservationText.includes('reason'), false, 'free-form approval reasons must not enter the task audit');
  const authorization = eventsAfterInterruption.find(event => event.type === 'task_execution_authorized');
  assert.equal(authorization.approvalVerified, true);
  assert.match(authorization.approvalDigest, /^[a-f0-9]{64}$/);
  const restartedBase = await restart();
  const recovered = await run(restartedBase);
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).recovered, true);
  assert.equal(createCalls, 1, 'recovery must reuse the already-created orchestrator task');
  assert.equal(runCalls, 1, 'recovery must execute the orchestrator task once');
  assert.equal(bridgeApprovalCalls, 1, 'durable bridge approval must not be re-verified after restart');
});



test('concurrent run requests for one task cannot start duplicate orchestrator executions', async t => {
  const taskId = '00000000-0000-4000-8000-000000000781';
  let storedTaskRecord = null;
  let orchestratorTask = null;
  let releaseRun;
  let signalRunStarted;
  const runGate = new Promise(resolve => { releaseRun = resolve; });
  const runStarted = new Promise(resolve => { signalRunStarted = resolve; });
  let runCalls = 0;
  const fetchImpl = async (url, init = {}) => {
    if (url === 'http://127.0.0.1:18797/health') return new Response(JSON.stringify({ ok: true, taskStateLookup: true }), { status: 200 });
    const body = init.body ? JSON.parse(init.body) : null;
    if (url === 'http://127.0.0.1:18796/api/tasks' && init.method === 'POST') {
      storedTaskRecord = body.taskRecord;
      return new Response(JSON.stringify({ ok: true, taskId }), { status: 201 });
    }
    if (url === 'http://127.0.0.1:18796/api/tasks/' + taskId) {
      return storedTaskRecord
        ? new Response(JSON.stringify({ ok: true, taskRecord: storedTaskRecord }), { status: 200 })
        : new Response('{}', { status: 404 });
    }
    if (url === 'http://127.0.0.1:18797/api/tasks/' + taskId + '/state') {
      return orchestratorTask
        ? new Response(JSON.stringify({ task: {
            id: taskId, state: orchestratorTask.state,
            goalHash: require('node:crypto').createHash('sha256').update(storedTaskRecord.goal, 'utf8').digest('hex')
          } }), { status: 200 })
        : new Response('{}', { status: 404 });
    }
    if (url === 'http://127.0.0.1:18797/api/tasks' && init.method === 'POST') {
      orchestratorTask = { id: taskId, state: 'proposed' };
      return new Response(JSON.stringify({ task: orchestratorTask }), { status: 201 });
    }
    if (url.endsWith('/approve')) {
      orchestratorTask.state = 'approved';
      return new Response(JSON.stringify({ task: orchestratorTask }), { status: 200 });
    }
    if (url.endsWith('/run')) {
      runCalls++;
      signalRunStarted();
      await runGate;
      orchestratorTask.state = 'completed';
      return new Response(JSON.stringify({ task: orchestratorTask, completedRoles: 16, failedRoles: 0 }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  const { base } = await withServer(t, { fetchImpl });
  const submitted = await fetch(base + '/api/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId, goal: 'Do not execute one approved task twice' })
  });
  assert.equal(submitted.status, 201);
  const run = () => fetch(base + '/api/tasks/' + taskId + '/run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approvalEvidence: TEST_APPROVAL_EVIDENCE })
  });
  const firstRun = run();
  await runStarted;
  const duplicate = await run();
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error, 'task_execution_request_already_in_flight');
  releaseRun();
  assert.equal((await firstRun).status, 200);
  assert.equal(runCalls, 1);
});

test('reconciles a completed orchestrator task when the bridge lost the run response', async t => {
  const taskId = '00000000-0000-4000-8000-000000000782';
  let storedTaskRecord = null;
  let orchestratorTask = null;
  let runCalls = 0;
  const fetchImpl = async (url, init = {}) => {
    if (url === 'http://127.0.0.1:18797/health') return new Response(JSON.stringify({ ok: true, taskStateLookup: true }), { status: 200 });
    const body = init.body ? JSON.parse(init.body) : null;
    if (url === 'http://127.0.0.1:18796/api/tasks' && init.method === 'POST') {
      storedTaskRecord = body.taskRecord;
      return new Response(JSON.stringify({ ok: true, taskId }), { status: 201 });
    }
    if (url === 'http://127.0.0.1:18796/api/tasks/' + taskId) {
      return storedTaskRecord
        ? new Response(JSON.stringify({ ok: true, taskRecord: storedTaskRecord }), { status: 200 })
        : new Response('{}', { status: 404 });
    }
    if (url === 'http://127.0.0.1:18797/api/tasks/' + taskId + '/state') {
      return orchestratorTask
        ? new Response(JSON.stringify({ task: {
            id: taskId, state: orchestratorTask.state,
            goalHash: require('node:crypto').createHash('sha256').update(storedTaskRecord.goal, 'utf8').digest('hex')
          } }), { status: 200 })
        : new Response('{}', { status: 404 });
    }
    if (url === 'http://127.0.0.1:18797/api/tasks' && init.method === 'POST') {
      orchestratorTask = { id: taskId, state: 'proposed' };
      return new Response(JSON.stringify({ task: orchestratorTask }), { status: 201 });
    }
    if (url.endsWith('/approve')) {
      orchestratorTask.state = 'approved';
      return new Response(JSON.stringify({ task: orchestratorTask }), { status: 200 });
    }
    if (url.endsWith('/run')) {
      runCalls++;
      orchestratorTask.state = 'completed';
      return new Response(JSON.stringify({ error: 'response_lost_after_completion' }), { status: 503 });
    }
    if (url === 'http://127.0.0.1:18797/api/tasks/' + taskId + '/result') {
      if (init.headers?.authorization !== 'Bearer test-orchestrator-result-read-token-32chars') return new Response('{}', { status: 401 });
      return new Response(JSON.stringify({ task: {
        id: taskId, state: 'completed', verificationStatus: 'not_run',
        results: [{ agentId: 'safety-auditor', state: 'completed', output: 'persisted-result' }]
      } }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  const { base, auditPath, restart } = await withServer(t, { fetchImpl });
  const submitted = await fetch(base + '/api/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId, goal: 'Recover completion when the bridge lost the response' })
  });
  assert.equal(submitted.status, 201);
  const run = () => fetch(base + '/api/tasks/' + taskId + '/run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approvalEvidence: TEST_APPROVAL_EVIDENCE })
  });
  assert.equal((await run()).status, 503);
  const recovered = await run();
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).recovered, true);
  assert.equal(runCalls, 1, 'terminal recovery must not re-execute the orchestrator task');
  const events = fs.readFileSync(auditPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert.ok(events.some(event => event.type === 'task_execution_completed' && event.taskId === taskId));
  const restartedBase = await restart();
  const replay = await fetch(restartedBase + '/api/tasks/' + taskId + '/run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approvalEvidence: TEST_APPROVAL_EVIDENCE })
  });
  assert.equal(replay.status, 200);
  const replayBody = await replay.json();
  assert.equal(replayBody.idempotentReplay, true);
  assert.equal(replayBody.recovered, true);
  assert.equal(runCalls, 1, 'bridge restart replay must retrieve stored results, not rerun inference');
});

test('verification rejection after execution is recovered as completed execution', async t => {
  const taskId = '00000000-0000-4000-8000-000000000786';
  const goalHash = crypto.createHash('sha256').update('Execution completed but verification rejected it', 'utf8').digest('hex');
  let runCalls = 0;
  const fetchImpl = async url => {
    if (url === 'http://127.0.0.1:18797/health') return new Response(JSON.stringify({ ok: true, taskStateLookup: true }), { status: 200 });
    if (url === 'http://127.0.0.1:18797/api/tasks/' + taskId + '/state') {
      return new Response(JSON.stringify({ task: {
        id: taskId, state: 'rejected', verificationStatus: 'rejected',
        goalHash, completedAt: '2026-11-10T12:00:00.000Z'
      } }), { status: 200 });
    }
    if (url === 'http://127.0.0.1:18797/api/tasks/' + taskId + '/result') {
      return new Response(JSON.stringify({ task: {
        id: taskId, state: 'rejected', verificationStatus: 'rejected',
        results: [{ agentId: 'reviewer', state: 'completed', output: 'execution-output-preserved' }]
      } }), { status: 200 });
    }
    if (url.endsWith('/run')) runCalls++;
    return new Response('{}', { status: 404 });
  };
  const { base } = await withServer(t, {
    fetchImpl,
    initialAuditEvents: [
      { type: 'task_submitted', taskId, goalHash, inboxAccepted: true },
      { type: 'task_execution_authorized', taskId, approvalVerified: true, approvalDigest: 'a'.repeat(64) },
      { type: 'task_execution_started', taskId, approvalVerified: true, approvalDigest: 'a'.repeat(64) }
    ]
  });
  const response = await fetch(base + '/api/tasks/' + taskId + '/run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approvalEvidence: TEST_APPROVAL_EVIDENCE })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.recovered, true);
  assert.equal(body.verificationStatus, 'rejected');
  assert.equal(body.result.task.results[0].output, 'execution-output-preserved');
  assert.equal(runCalls, 0, 'verification rejection must not re-run completed execution');
});

test('durable failed execution is replayed as a known failure, not an unknown conflict', async t => {
  const taskId = '00000000-0000-4000-8000-000000000784';
  const goal = 'A previously failed task must report its known terminal outcome';
  const goalHash = crypto.createHash('sha256').update(goal, 'utf8').digest('hex');
  let upstreamCalls = 0;
  const fetchImpl = async () => { upstreamCalls++; return new Response('{}', { status: 500 }); };
  const { base } = await withServer(t, {
    fetchImpl,
    initialAuditEvents: [
      { type: 'task_submitted', taskId, goalHash, inboxAccepted: true },
      { type: 'task_execution_failed', taskId, orchestratorTaskId: taskId, error: 'persisted_execution_failure' }
    ]
  });
  const response = await fetch(base + '/api/tasks/' + taskId + '/run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approvalEvidence: TEST_APPROVAL_EVIDENCE })
  });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.idempotentReplay, true);
  assert.equal(body.failure.error, 'persisted_execution_failure');
  assert.equal(upstreamCalls, 0, 'known terminal failure replay must not call upstream services');
});

test('completed-result replay classifies upstream failures as retryable and preserves confirmed 404 as not cached', async t => {
  const taskIds = {
    http502: '00000000-0000-4000-8000-000000000786',
    invalidJson: '00000000-0000-4000-8000-000000000787',
    network: '00000000-0000-4000-8000-000000000788',
    missing: '00000000-0000-4000-8000-000000000789'
  };
  const digest = 'b'.repeat(64);
  const initialAuditEvents = Object.values(taskIds).flatMap(taskId => {
    const goalHash = crypto.createHash('sha256').update('completed goal ' + taskId, 'utf8').digest('hex');
    return [
      { type: 'task_submitted', taskId, goalHash, inboxAccepted: true },
      { type: 'task_execution_completed', taskId, orchestratorTaskId: taskId, approvalVerified: true, approvalDigest: 'a'.repeat(64), resultSha256: digest }
    ];
  });
  let runCalls = 0;
  const fetchImpl = async url => {
    const taskId = Object.values(taskIds).find(id => url.includes('/api/tasks/' + id + '/result'));
    if (!taskId) {
      if (url.includes('/run')) runCalls++;
      throw new Error('unexpected_upstream_request');
    }
    if (taskId === taskIds.http502) return new Response(JSON.stringify({ error: 'upstream_unavailable' }), { status: 502 });
    if (taskId === taskIds.invalidJson) return new Response('not-json', { status: 200 });
    if (taskId === taskIds.network) throw new Error('simulated_socket_reset');
    return new Response('{}', { status: 404 });
  };
  const { base } = await withServer(t, { fetchImpl, initialAuditEvents });
  for (const taskId of [taskIds.http502, taskIds.invalidJson, taskIds.network]) {
    const response = await fetch(base + '/api/tasks/' + taskId + '/run', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
    });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error, 'task_completed_result_read_retryable');
    assert.equal(body.retryable, true);
    assert.equal(body.resultSha256, digest);
    assert.ok(body.upstreamStatus === null || body.upstreamStatus === 502);
  }
  const missing = await fetch(base + '/api/tasks/' + taskIds.missing + '/run', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(missing.status, 409);
  const missingBody = await missing.json();
  assert.equal(missingBody.error, 'task_completed_result_not_cached');
  assert.equal(missingBody.resultSha256, digest);
  assert.equal(runCalls, 0, 'result retrieval failures must never trigger a second orchestrator execution');
});

test('sanitizes legacy audit records without restoring raw results to replay cache', async t => {
  const taskId = '00000000-0000-4000-8000-000000000101';
  const goalSentinel = 'LEGACY_GOAL_SENTINEL_20261110';
  const result = { privateResult: 'LEGACY_RESULT_SENTINEL_20261110' };
  const initialAuditEvents = [
    {
      timestamp: '2026-11-09T00:00:00.000Z',
      type: 'task_submitted',
      taskId,
      goal: goalSentinel,
      inbox: { taskRecord: { taskId, goal: goalSentinel } },
      goalHash: crypto.createHash('sha256').update(goalSentinel, 'utf8').digest('hex')
    },
    {
      timestamp: '2026-11-09T00:01:00.000Z',
      type: 'task_execution_completed',
      taskId,
      orchestratorTaskId: taskId,
      approval: { approvalId: 'legacy-approval' },
      result
    }
  ];
  const { base, auditPath } = await withServer(t, { initialAuditEvents });
  const originalAudit = fs.readFileSync(auditPath, 'utf8');
  assert.ok(originalAudit.includes(goalSentinel));
  assert.ok(originalAudit.includes(result.privateResult));

  const recent = await (await fetch(base + '/api/audit/recent')).json();
  const recentJson = JSON.stringify(recent);
  assert.ok(!recentJson.includes(goalSentinel));
  assert.ok(!recentJson.includes(result.privateResult));
  assert.equal(recent.events.find(event => event.type === 'task_submitted').goalHash,
    crypto.createHash('sha256').update(goalSentinel, 'utf8').digest('hex'));

  const replay = await fetch(base + '/api/tasks/' + taskId + '/run', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(replay.status, 409);
  const replayBody = await replay.json();
  assert.equal(replayBody.error, 'task_completed_result_not_cached');
  assert.equal(replayBody.resultSha256, crypto.createHash('sha256').update(JSON.stringify(result), 'utf8').digest('hex'));
  assert.ok(!JSON.stringify(replayBody).includes(result.privateResult));
  assert.equal(fs.readFileSync(auditPath, 'utf8'), originalAudit, 'legacy audit bytes must remain unchanged');
});

test('does not restore any legacy raw result into the replay cache after restart', async t => {
  const taskId = index => '00000000-0000-4000-8000-' + String(index).padStart(12, '0');
  const goalHash = 'a'.repeat(64);
  const initialAuditEvents = [];
  for (let index = 1; index <= 102; index++) {
    initialAuditEvents.push({ timestamp: '2026-11-10T00:00:00.000Z', type: 'task_submitted', taskId: taskId(index), goalHash });
  }
  for (let index = 1; index <= 101; index++) {
    initialAuditEvents.push({
      timestamp: '2026-11-10T00:01:00.000Z',
      type: 'task_execution_completed',
      taskId: taskId(index),
      orchestratorTaskId: taskId(index),
      result: { value: 'cached-result-' + index }
    });
  }
  initialAuditEvents.push({
    timestamp: '2026-11-10T00:02:00.000Z',
    type: 'task_execution_completed',
    taskId: taskId(102),
    orchestratorTaskId: taskId(102),
    result: { value: 'x'.repeat(1_000_001) }
  });
  const { base } = await withServer(t, { initialAuditEvents });

  const evicted = await fetch(base + '/api/tasks/' + taskId(1) + '/run', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(evicted.status, 409);
  assert.equal((await evicted.json()).error, 'task_completed_result_not_cached');

  const retained = await fetch(base + '/api/tasks/' + taskId(101) + '/run', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(retained.status, 409);
  const retainedBody = await retained.json();
  assert.equal(retainedBody.error, 'task_completed_result_not_cached');
  assert.equal(retainedBody.resultSha256, crypto.createHash('sha256').update(JSON.stringify({ value: 'cached-result-101' }), 'utf8').digest('hex'));
  assert.ok(!JSON.stringify(retainedBody).includes('cached-result-101'));

  const oversized = await fetch(base + '/api/tasks/' + taskId(102) + '/run', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}'
  });
  assert.equal(oversized.status, 409);
  assert.equal((await oversized.json()).error, 'task_completed_result_not_cached');
});

test('bounds in-memory recent audit history without changing the persisted event count', async t => {
  const initialAuditEvents = Array.from({ length: 520 }, (_, index) => ({
    timestamp: '2026-11-10T00:00:00.000Z',
    type: 'test_event',
    taskId: String(index)
  }));
  const { base } = await withServer(t, { initialAuditEvents });
  const health = await (await fetch(base + '/health')).json();
  assert.equal(health.auditEvents, 520);
  assert.equal(health.recentAuditEvents, 500);
  const recent = await (await fetch(base + '/api/audit/recent')).json();
  assert.equal(recent.events.length, 100);
  assert.equal(recent.events[0].taskId, '420');
  assert.equal(recent.events.at(-1).taskId, '519');
});

test('idempotency key cannot be reused for a different action', async t => {
  const { base } = await withServer(t, { writeApi: { async createFeatureBranch() { return { branch: 'hf-agent/a' }; } } });
  const approval = { approved: true, approvedBy: 'operator', reason: 'test' };
  const first = { repo: 'HeavenzFire/HeavenzFire', branch: 'hf-agent/a', idempotencyKey: 'same-key-0000001', approvalEvidence: TEST_APPROVAL_EVIDENCE, approval };
  await fetch(base + '/api/github/branches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(first) });
  const second = { ...first, branch: 'hf-agent/b' };
  const r = await fetch(base + '/api/github/branches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(second) });
  assert.equal(r.status, 409);
});
test('rejects non-JSON writes and invalid host headers', async t => {
  const { base } = await withServer(t);
  const http = require('node:http');
  const badHost = await new Promise((resolve, reject) => { const req = http.request(base + '/health', { headers: { host: 'attacker.example' } }, res => { res.resume(); resolve(res); }); req.on('error', reject); req.end(); });
  assert.equal(badHost.statusCode, 403);
  const badType = await fetch(base + '/api/github/issues', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ title: 'csrf' }) });
  assert.equal(badType.status, 415);
});