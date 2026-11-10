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
  const server = createGitHubBridgeServer({
    port: 0, auditPath,
    tokenProvider: () => 'test-token-that-is-long-enough',
    allowedOwners: ['HeavenzFire'],
    approvalVerifier: testApprovalVerifier,
    readAuthorizer: () => true,
    inboxReadToken: 'test-inbox-read-token-that-is-at-least-32-chars',
    ...serverOptions
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { base: 'http://127.0.0.1:' + address.port, auditPath };
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
  assert.equal((await replay.json()).idempotentReplay, true);
  assert.equal(approvalCalls, 1, 'completed write replay must not consume the one-time approval twice');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].writeEnabled, true);
  const events = fs.readFileSync(auditPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
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
  const auditEvents = auditText.trim().split(/\r?\n/).map(JSON.parse);
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
    assert.equal(replayAfterRestart.status, 409);
    const restartBody = await replayAfterRestart.json();
    assert.equal(restartBody.error, 'task_completed_result_not_cached');
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
  const submit = goal => fetch(base + '/api/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId, goal })
  });
  const first = await submit('Stable task intake identity');
  assert.equal(first.status, 201);
  const replay = await submit('Stable task intake identity');
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).idempotentReplay, true);
  assert.equal(inboxPosts, 1, 'same task ID and goal must not create a second inbox record');
  const conflict = await submit('Different goal under the same task ID');
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error, 'task_id_conflicts_with_different_goal');
  assert.equal(inboxPosts, 1);
});

test('reserved task execution recovers after crash between orchestrator creation and approval', async t => {
  const taskId = '00000000-0000-4000-8000-000000000778';
  let storedTaskRecord = null;
  let orchestratorTask = null;
  let failFirstApproval = true;
  let createCalls = 0;
  let runCalls = 0;
  const fetchImpl = async (url, init = {}) => {
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
  const { base, auditPath } = await withServer(t, { fetchImpl });
  const submitted = await fetch(base + '/api/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId, goal: 'Recover an interrupted approved task' })
  });
  assert.equal(submitted.status, 201);
  const run = () => fetch(base + '/api/tasks/' + taskId + '/run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approvalEvidence: TEST_APPROVAL_EVIDENCE })
  });
  const interrupted = await run();
  assert.equal(interrupted.status, 503);
  const eventsAfterInterruption = fs.readFileSync(auditPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  assert.ok(eventsAfterInterruption.some(event => event.type === 'task_execution_reserved'));
  assert.equal(eventsAfterInterruption.some(event => event.type === 'task_execution_started'), false);
  const recovered = await run();
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).recovered, true);
  assert.equal(createCalls, 1, 'recovery must reuse the already-created orchestrator task');
  assert.equal(runCalls, 1, 'recovery must execute the orchestrator task once');
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
    return new Response('{}', { status: 404 });
  };
  const { base, auditPath } = await withServer(t, { fetchImpl });
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
  const events = fs.readFileSync(auditPath, 'utf8').trim().split(/\\r?\\n/).map(JSON.parse);
  assert.ok(events.some(event => event.type === 'task_execution_completed' && event.taskId === taskId));
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