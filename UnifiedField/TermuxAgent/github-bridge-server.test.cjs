'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createGitHubBridgeServer, ORCHESTRATOR_TIMEOUT_MS } = require('./github-bridge-server.cjs');

const TEST_APPROVAL_EVIDENCE = Object.freeze({ fixture: 'trusted-human-approval-test' });
async function testApprovalVerifier({ action, subject, evidence }) {
  if (!evidence || evidence.fixture !== TEST_APPROVAL_EVIDENCE.fixture || !subject || typeof subject !== 'object') throw new Error('test_approval_evidence_invalid');
  return { approved: true, approvalId: 'test-approval-' + String(subject.taskId || subject.fingerprint || action), approvedBy: 'verified-test-operator', reason: 'Deterministic test approval fixture.', method: 'injected-test-verifier', verifiedAt: '2026-11-05T08:00:00.000Z' };
}
test('orchestrator task requests allow full 16-role execution window', () => { assert.equal(ORCHESTRATOR_TIMEOUT_MS, 180000); });

async function withServer(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-gh-bridge-'));
  const auditPath = path.join(dir, 'audit.jsonl');
  const server = createGitHubBridgeServer({
    port: 0, auditPath,
    tokenProvider: () => 'test-token-that-is-long-enough',
    allowedOwners: ['HeavenzFire'],
    approvalVerifier: testApprovalVerifier,
    ...options
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
  const { base, auditPath } = await withServer(t, { writeApi });
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

test('task intake persists to inbox and 16-role execution requires approval', async t => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    if (url === 'http://127.0.0.1:18796/api/tasks') return new Response(JSON.stringify({ ok: true, taskId: calls.at(-1).body.taskRecord.taskId }), { status: 201 });
    if (url === 'http://127.0.0.1:18797/api/tasks') return new Response(JSON.stringify({ task: { id: '00000000-0000-4000-8000-000000000001' } }), { status: 201 });
    if (url.endsWith('/approve')) return new Response(JSON.stringify({ task: { state: 'approved' } }), { status: 200 });
    if (url.endsWith('/run')) return new Response(JSON.stringify({ task: { state: 'completed' }, completedRoles: 16, failedRoles: 0 }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const { base } = await withServer(t, { fetchImpl });
  const submitted = await fetch(base + '/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'Review the GitHub integration' }) });
  assert.equal(submitted.status, 201);
  const task = await submitted.json();
  const denied = await fetch(base + '/api/tasks/' + task.taskId + '/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(denied.status, 403);
  const run = await fetch(base + '/api/tasks/' + task.taskId + '/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approvalEvidence: TEST_APPROVAL_EVIDENCE }) });
  assert.equal(run.status, 200);
  assert.equal((await run.json()).result.completedRoles, 16);
  assert.ok(calls.some(x => x.url === 'http://127.0.0.1:18796/api/tasks'));
  assert.ok(calls.some(x => x.url === 'http://127.0.0.1:18797/api/tasks'));
  const approvalCall = calls.find(x => x.url.endsWith('/approve'));
  assert.equal(approvalCall.body.approve, true);
  assert.equal(approvalCall.body.approvalContext.taskId, task.taskId);
  assert.ok(approvalCall.body.approvalContext.goalHash);
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