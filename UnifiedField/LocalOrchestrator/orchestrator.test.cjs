'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createOrchestrator, readManifest, runBounded, invokeGatewayRuntime, invokeLlamaCppRuntime } = require('./orchestrator.cjs');
const { createTaskLedger } = require('./task-ledger.cjs');
const crypto = require('node:crypto');

const TEST_APPROVAL_EVIDENCE = Object.freeze({ fixture: 'trusted-human-approval-test' });
async function testApprovalVerifier({ action, subject, evidence }) {
  if (!evidence || evidence.fixture !== TEST_APPROVAL_EVIDENCE.fixture || !subject || typeof subject !== 'object') throw new Error('test_approval_evidence_invalid');
  return { approved: true, approvalId: 'test-approval-' + String(subject.taskId || action), approvedBy: 'verified-test-operator', reason: 'Deterministic test approval fixture.', method: 'injected-test-verifier', verifiedAt: '2026-11-05T08:00:00.000Z' };
}
function taskApprovalPayload(taskId, goal) {
  return { approve: true, approvalContext: { taskId, goalHash: crypto.createHash('sha256').update(goal).digest('hex') }, approvalEvidence: TEST_APPROVAL_EVIDENCE };
}

async function withServer(options, fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-orchestrator-test-'));
  const app = createOrchestrator({ port: 0, ledgerPath: path.join(tempDir, 'tasks.jsonl'), invoke: async ({ agent }) => ({ agentId: agent.id, state: 'completed', output: 'verified-test-stub' }), approvalVerifier: testApprovalVerifier, ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  try { await fn('http://127.0.0.1:' + address.port); }
  finally {
    await new Promise(resolve => app.server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}


async function createCompletedTask(base, candidateCommit) {
  const body = { goal: 'Exercise the UF-TCP task verification boundary.' };
  if (candidateCommit !== undefined) body.candidateCommit = candidateCommit;
  const created = await fetch(base + '/api/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  assert.equal(created.status, 201);
  const task = (await created.json()).task;
  const approved = await fetch(base + '/api/tasks/' + task.id + '/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(taskApprovalPayload(task.id, body.goal))
  });
  assert.equal(approved.status, 200);
  const ran = await fetch(base + '/api/tasks/' + task.id + '/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  });
  assert.equal(ran.status, 200);
  return task;
}

function validConsensus(candidateCommit) {
  const digest = 'a'.repeat(64);
  return {
    candidate_commit: candidateCommit,
    reviewed_commit: candidateCommit,
    tested_commit: candidateCommit,
    proposer_id: 'local-orchestrator',
    mandatory_invariants: [{ id: 'no-secret-leak', status: 'pass' }],
    counterexamples: [],
    gates: {
      tests_pass: true,
      security_review_pass: true,
      evidence_complete: true,
      reproducible: true,
      fresh: true
    },
    evidence_sha256: digest,
    verifiers: [
      { id: 'verifier-a', identity: 'process-a', execution_id: 'exec-a', isolation_id: 'sandbox-a', independent: true, evidence_sha256: digest, decision: 1, rationale: 'Reviewed the exact candidate revision.' },
      { id: 'verifier-b', identity: 'process-b', execution_id: 'exec-b', isolation_id: 'sandbox-b', independent: true, evidence_sha256: digest, decision: 1, rationale: 'Independently reproduced the required checks.' }
    ]
  };
}

test('manifest contains 16 unique named roles and caps parallelism at four', () => {
  const manifest = readManifest();
  assert.equal(manifest.agents.length, 16);
  assert.equal(new Set(manifest.agents.map(agent => agent.id)).size, 16);
  assert.ok(manifest.maxParallel >= 1 && manifest.maxParallel <= 4);
});

test('refuses non-loopback bind addresses and remote Ollama endpoints', () => {
  assert.throws(() => createOrchestrator({ host: '0.0.0.0' }), /must_bind_loopback/);
  assert.throws(() => createOrchestrator({ ollamaUrl: 'http://192.168.1.10:11434' }), /ollama_must_use_http_loopback/);
  assert.throws(() => createOrchestrator({ ollamaUrl: 'https://example.com' }), /ollama_must_use_http_loopback/);
});

test('proposal cannot run until explicit approval and then fans out to all 16 roles', async () => {
  let calls = 0;
  await withServer({ invoke: async ({ agent }) => { calls++; return { agentId: agent.id, state: 'completed', output: 'ok' }; } }, async base => {
    const created = await fetch(base + '/api/tasks', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ goal: 'Review the local orchestrator safely.' }) });
    assert.equal(created.status, 201);
    const task = (await created.json()).task;
    assert.equal(task.state, 'proposed');
    const denied = await fetch(base + '/api/tasks/' + task.id + '/run', { method: 'POST', headers: {'content-type':'application/json'}, body: '{}' });
    assert.equal(denied.status, 409);
    assert.equal(calls, 0);
    const approved = await fetch(base + '/api/tasks/' + task.id + '/approve', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(taskApprovalPayload(task.id, 'Review the local orchestrator safely.')) });
    assert.equal(approved.status, 200);
    const ran = await fetch(base + '/api/tasks/' + task.id + '/run', { method: 'POST', headers: {'content-type':'application/json'}, body: '{}' });
    assert.equal(ran.status, 200);
    const result = await ran.json();
    assert.equal(result.completedRoles, 16);
    assert.equal(result.task.results.length, 16);
    assert.equal(result.task.state, 'completed');
    assert.equal(result.task.approval.approvedBy, 'verified-test-operator');
    assert.ok(result.task.approval.evidenceSha256);
    assert.equal(result.task.consensus.decision, 0);
    assert.equal(result.task.consensus.code, 'VERIFICATION_NOT_RUN');
    assert.equal(calls, 16);
  });
});

test('self-asserted request fields cannot approve a task without a trusted verifier', async () => {
  await withServer({ approvalVerifier: null }, async base => {
    const created = await fetch(base + '/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'approval must be attributable' }) });
    const task = (await created.json()).task;
    const response = await fetch(base + '/api/tasks/' + task.id + '/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approve: true, approvedBy: 'operator', reason: 'self-asserted', approval: { approved: true } }) });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'trusted_approval_verifier_not_configured');
    const state = await fetch(base + '/api/tasks');
    const snapshot = await state.json();
    assert.equal(snapshot.tasks.find(item => item.id === task.id)?.state, 'proposed');
  });
});

test('approval context cannot be transferred to another task with the same goal', async () => {
  await withServer({}, async base => {
    const goal = 'approval must bind to one exact orchestrator task';
    const created = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal })
    });
    const task = (await created.json()).task;
    const transferred = await fetch(base + '/api/tasks/' + task.id + '/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(taskApprovalPayload('00000000-0000-4000-8000-000000000099', goal))
    });
    assert.equal(transferred.status, 403);
    assert.equal((await transferred.json()).error, 'approval_context_mismatch');
    assert.equal((await (await fetch(base + '/api/tasks')).json()).tasks.find(item => item.id === task.id).state, 'proposed');

    const exact = await fetch(base + '/api/tasks/' + task.id + '/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(taskApprovalPayload(task.id, goal))
    });
    assert.equal(exact.status, 200);
  });
});

test('orchestrator result recovery endpoint requires a separate bearer token and omits the prompt', async t => {
  const token = '0123456789abcdef0123456789abcdef';
  await withServer({ resultReadToken: token }, async base => {
    const task = await createCompletedTask(base);
    const denied = await fetch(base + '/api/tasks/' + task.id + '/result');
    assert.equal(denied.status, 401);
    const authorized = await fetch(base + '/api/tasks/' + task.id + '/result', {
      headers: { authorization: 'Bearer ' + token }
    });
    assert.equal(authorized.status, 200);
    const payload = await authorized.json();
    assert.equal(payload.task.id, task.id);
    assert.equal(payload.task.state, 'completed');
    assert.equal(payload.task.results.length, 16);
    assert.equal(Object.prototype.hasOwnProperty.call(payload.task, 'goal'), false);
  });
});

test('orchestrator exposes one task by ID for crash recovery reconciliation', async () => {
  await withServer({}, async base => {
    const taskId = '00000000-0000-4000-8000-000000000779';
    const created = await fetch(base + '/api/tasks', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId, goal: 'reconcile task state after bridge restart' })
    });
    assert.equal(created.status, 201);
    const detail = await fetch(base + '/api/tasks/' + taskId + '/state');
    assert.equal(detail.status, 200);
    const detailBody = await detail.json();
    assert.equal(detailBody.task.id, taskId);
    assert.equal(detailBody.task.state, 'proposed');
    assert.equal(detailBody.task.goalHash, require('node:crypto').createHash('sha256').update('reconcile task state after bridge restart').digest('hex'));
    assert.equal(Object.prototype.hasOwnProperty.call(detailBody.task, 'goal'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(detailBody.task, 'results'), false);
    const approved = await fetch(base + '/api/tasks/' + taskId + '/approve', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(taskApprovalPayload(taskId, 'reconcile task state after bridge restart'))
    });
    assert.equal(approved.status, 200);
    const approvedState = await fetch(base + '/api/tasks/' + taskId + '/state');
    assert.equal((await approvedState.json()).task.state, 'approved');
    const missing = await fetch(base + '/api/tasks/00000000-0000-4000-8000-000000000780/state');
    assert.equal(missing.status, 404);
  });
});

test('orchestrator accepts a canonical externally bound task ID once and rejects duplicates', async () => {
  await withServer({}, async base => {
    const taskId = '00000000-0000-4000-8000-000000000123';
    const create = () => fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId, goal: 'bridge-bound task identity' })
    });
    const first = await create();
    assert.equal(first.status, 201);
    assert.equal((await first.json()).task.id, taskId);
    const duplicate = await create();
    assert.equal(duplicate.status, 409);
    assert.equal((await duplicate.json()).error, 'task_id_already_exists');
    const malformed = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: 'not-a-uuid', goal: 'invalid task identity' })
    });
    assert.equal(malformed.status, 400);
  });
});

test('bounded worker pool never exceeds declared concurrency', async () => {
  let active = 0, maximum = 0;
  const results = await runBounded(Array.from({length:16}, (_, i) => i), 4, async value => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 3));
    active--;
    return value;
  });
  assert.equal(results.length, 16);
  assert.equal(maximum, 4);
});

test('rejects oversized goals and invalid approval payload', async () => {
  await withServer({}, async base => {
    const oversized = await fetch(base + '/api/tasks', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({goal:'x'.repeat(5000)}) });
    assert.equal(oversized.status, 400);
    const created = await fetch(base + '/api/tasks', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({goal:'test approval validation'}) });
    const task = (await created.json()).task;
    const approval = await fetch(base + '/api/tasks/' + task.id + '/approve', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({approve:false}) });
    assert.equal(approval.status, 400);
  });
});


test('JSONL task ledger persists snapshots across instances and repairs a torn final record', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-ledger-test-'));
  const filePath = path.join(directory, 'tasks.jsonl');
  try {
    const first = createTaskLedger({ filePath });
    first.save({ id: 'task-1', state: 'proposed', goal: 'durability check' });
    const second = createTaskLedger({ filePath });
    assert.deepEqual(second.load(), [{ id: 'task-1', state: 'proposed', goal: 'durability check' }]);
    fs.appendFileSync(filePath, '{"v":1,"task":');
    assert.deepEqual(second.load(), [{ id: 'task-1', state: 'proposed', goal: 'durability check' }]);
    assert.ok(fs.readFileSync(filePath, 'utf8').endsWith('\n'));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('orchestrator reloads durable task history after a process restart', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-restart-test-'));
  const ledgerPath = path.join(directory, 'tasks.jsonl');
  const first = createOrchestrator({ port: 0, ledgerPath, invoke: async ({ agent }) => ({ agentId: agent.id, state: 'completed', output: 'ok' }) });
  await new Promise(resolve => first.server.listen(0, '127.0.0.1', resolve));
  const address = first.server.address();
  let taskId;
  try {
    const created = await fetch('http://127.0.0.1:' + address.port + '/api/tasks', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ goal: 'survive restart' }) });
    taskId = (await created.json()).task.id;
  } finally {
    await new Promise(resolve => first.server.close(resolve));
  }
  const second = createOrchestrator({ port: 0, ledgerPath, invoke: async ({ agent }) => ({ agentId: agent.id, state: 'completed', output: 'ok' }) });
  try {
    const tasks = Array.from(second.tasks.values());
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, taskId);
    assert.equal(tasks[0].state, 'proposed');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test('rejects malformed candidate commit at task creation', async () => {
  await withServer({}, async base => {
    const response = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'invalid revision', candidateCommit: 'not-a-git-sha' })
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'candidate_commit_must_be_a_40_character_git_sha');
  });
});

test('verification cannot run before the approved task has completed', async () => {
  await withServer({}, async base => {
    const created = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'verification lifecycle', candidateCommit: 'b'.repeat(40) })
    });
    const task = (await created.json()).task;
    const verify = await fetch(base + '/api/tasks/' + task.id + '/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validConsensus('b'.repeat(40)))
    });
    assert.equal(verify.status, 409);
  });
});

test('role completion alone remains ABSTAIN and cannot mark a task verified', async () => {
  await withServer({}, async base => {
    const task = await createCompletedTask(base);
    const response = await fetch(base + '/api/tasks/' + task.id + '/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(response.status, 200);
    const result = (await response.json()).task;
    assert.equal(result.state, 'completed');
    assert.equal(result.verificationStatus, 'abstain');
    assert.equal(result.consensus.decision, 0);
    assert.equal(result.consensus.code, 'CANDIDATE_COMMIT_MISSING');
  });
});

test('UF-TCP ACCEPT requires exact candidate, reviewed, and tested revision binding', async () => {
  await withServer({}, async base => {
    const sha = 'c'.repeat(40);
    const task = await createCompletedTask(base, sha);
    const evidence = validConsensus(sha);
    const response = await fetch(base + '/api/tasks/' + task.id + '/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(evidence)
    });
    assert.equal(response.status, 200);
    const result = (await response.json()).task;
    assert.equal(result.state, 'verified');
    assert.equal(result.verificationStatus, 'accepted');
    assert.equal(result.consensus.decision, 1);
    assert.equal(result.consensus.policy, 'UF-TCP/0.2');
  });
});

test('revision drift abstains and leaves task unverified', async () => {
  await withServer({}, async base => {
    const sha = 'd'.repeat(40);
    const task = await createCompletedTask(base, sha);
    const evidence = validConsensus(sha);
    evidence.tested_commit = 'e'.repeat(40);
    const response = await fetch(base + '/api/tasks/' + task.id + '/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(evidence)
    });
    const result = (await response.json()).task;
    assert.equal(result.state, 'completed');
    assert.equal(result.verificationStatus, 'abstain');
    assert.equal(result.consensus.code, 'REVISION_BINDING_MISMATCH');
  });
});

test('UF-TCP REJECT records a reproduced counterexample and rejects the task', async () => {
  await withServer({}, async base => {
    const sha = 'f'.repeat(40);
    const task = await createCompletedTask(base, sha);
    const evidence = validConsensus(sha);
    evidence.counterexamples = [{ id: 'reproduced-failure', status: 'reproduced' }];
    const response = await fetch(base + '/api/tasks/' + task.id + '/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(evidence)
    });
    const result = (await response.json()).task;
    assert.equal(result.state, 'rejected');
    assert.equal(result.verificationStatus, 'rejected');
    assert.equal(result.consensus.decision, -1);
    assert.equal(result.consensus.code, 'REPRODUCIBLE_COUNTEREXAMPLE');
  });
});



test('llama.cpp provider is restricted to an unauthenticated HTTP loopback endpoint', () => {
  assert.throws(() => createOrchestrator({
    provider: 'llama-cpp',
    llamaCppUrl: 'http://192.168.1.20:18080'
  }), /llama_cpp_must_use_http_loopback/);
  assert.throws(() => createOrchestrator({
    provider: 'llama-cpp',
    llamaCppUrl: 'https://127.0.0.1:18080'
  }), /llama_cpp_must_use_http_loopback/);
  assert.doesNotThrow(() => createOrchestrator({
    provider: 'llama-cpp',
    llamaCppUrl: 'http://127.0.0.1:18080'
  }));
  assert.doesNotThrow(() => createOrchestrator({
    provider: 'llama-cpp',
    llamaCppUrl: 'http://127.0.0.1:18080',
    ollamaUrl: 'https://unused-ollama.example'
  }));
});

test('llama.cpp adapter sends OpenAI-compatible local chat requests without forwarding credentials', async () => {
  let captured;
  const result = await invokeLlamaCppRuntime({
    agent: { id: 'runtime-integrator', objective: 'Verify local runtime compatibility.' },
    goal: 'Inspect the bounded local adapter.',
    model: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    llamaCppUrl: 'http://127.0.0.1:18080',
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-local-123',
          model: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
          choices: [{ message: { content: 'Local llama.cpp response.' } }]
        })
      };
    }
  });
  assert.equal(captured.url, 'http://127.0.0.1:18080/v1/chat/completions');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers.authorization, undefined);
  assert.equal(captured.body.model, 'qwen2.5-0.5b-instruct-q4_k_m.gguf');
  assert.equal(captured.body.stream, false);
  assert.match(captured.body.messages[1].content, /runtime-integrator/);
  assert.match(captured.body.messages[1].content, /Inspect the bounded local adapter/);
  assert.equal(result.state, 'completed');
  assert.equal(result.provider, 'llama.cpp');
  assert.equal(result.providerRequestId, 'chatcmpl-local-123');
  assert.equal(result.output, 'Local llama.cpp response.');
});

test('llama.cpp health reports local provider and does not expose credentials', async () => {
  await withServer({
    provider: 'llama-cpp',
    llamaCppUrl: 'http://127.0.0.1:18080',
    model: 'qwen2.5-0.5b-instruct-q4_k_m.gguf'
  }, async base => {
    const response = await fetch(base + '/health');
    const health = await response.json();
    assert.equal(health.provider, 'llama.cpp');
    assert.equal(health.model, 'qwen2.5-0.5b-instruct-q4_k_m.gguf');
    assert.equal(health.execution, 'loopback-openai-compatible-llama.cpp');
  });
});


test('task scheduler dispatches all 16 roles through the local llama.cpp adapter', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-llama-scheduler-test-'));
  let calls = 0;
  const app = createOrchestrator({
    port: 0,
    ledgerPath: path.join(directory, 'tasks.jsonl'),
    approvalVerifier: testApprovalVerifier,
    provider: 'llama-cpp',
    llamaCppUrl: 'http://127.0.0.1:18080',
    model: 'qwen2.5-0.5b-instruct-q4_k_m.gguf',
    fetchImpl: async (url, options) => {
      calls += 1;
      assert.equal(String(url), 'http://127.0.0.1:18080/v1/chat/completions');
      assert.equal(options.headers.authorization, undefined);
      const request = JSON.parse(options.body);
      assert.equal(request.model, 'qwen2.5-0.5b-instruct-q4_k_m.gguf');
      return {
        ok: true,
        json: async () => ({
          id: 'llama-request-' + calls,
          model: request.model,
          choices: [{ message: { content: 'local-role-result-' + calls } }]
        })
      };
    }
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  const base = 'http://127.0.0.1:' + address.port;
  try {
    const goal = 'Exercise the 16-role local llama.cpp path.';
    const created = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal })
    });
    const task = (await created.json()).task;
    const approved = await fetch(base + '/api/tasks/' + task.id + '/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(taskApprovalPayload(task.id, goal))
    });
    assert.equal(approved.status, 200);
    const response = await fetch(base + '/api/tasks/' + task.id + '/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(response.status, 200);
    const result = (await response.json()).task;
    assert.equal(calls, 16);
    assert.equal(result.results.length, 16);
    assert.ok(result.results.every(item => item.provider === 'llama.cpp'));
    assert.equal(result.execution.provider, 'llama.cpp');
    assert.equal(result.execution.model, 'qwen2.5-0.5b-instruct-q4_k_m.gguf');
    assert.equal(result.execution.providerRequestIds.length, 16);
    assert.equal(result.consensus.decision, 0);
    assert.equal(result.state, 'completed');
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('gateway provider is loopback-only and requires a bearer token', () => {
  assert.throws(() => createOrchestrator({
    provider: 'heavenzfire-api',
    gatewayUrl: 'http://192.168.1.10:18796',
    gatewayToken: 'x'.repeat(32)
  }), /gateway_must_use_http_loopback/);
  assert.throws(() => createOrchestrator({
    provider: 'heavenzfire-api',
    gatewayUrl: 'http://127.0.0.1:18796',
    gatewayToken: ''
  }), /gateway_bearer_token_required/);
});

test('gateway transport accepts only explicit HTTPS Tailscale Serve endpoints', () => {
  const token = 'local-bearer-token-12345678901234567890';
  assert.doesNotThrow(() => createOrchestrator({ provider: 'heavenzfire-api', gatewayTransport: 'tailnet-https', gatewayUrl: 'https://arm64-worker.example-tailnet.ts.net', gatewayToken: token }));
  assert.throws(() => createOrchestrator({ provider: 'heavenzfire-api', gatewayTransport: 'tailnet-https', gatewayUrl: 'http://arm64-worker.example-tailnet.ts.net', gatewayToken: token }), /gateway_tailnet_transport_requires_https/);
  assert.throws(() => createOrchestrator({ provider: 'heavenzfire-api', gatewayTransport: 'tailnet-https', gatewayUrl: 'https://example.com', gatewayToken: token }), /gateway_tailnet_transport_requires_https/);
  assert.throws(() => createOrchestrator({ provider: 'heavenzfire-api', gatewayTransport: 'tailnet-https', gatewayUrl: 'https://arm64-worker.example-tailnet.ts.net:8443', gatewayToken: token }), /gateway_tailnet_transport_requires_https/);
  assert.throws(() => createOrchestrator({ provider: 'heavenzfire-api', gatewayTransport: 'loopback', gatewayUrl: 'https://arm64-worker.example-tailnet.ts.net', gatewayToken: token }), /gateway_must_use_http_loopback/);
  assert.throws(() => createOrchestrator({ provider: 'heavenzfire-api', gatewayTransport: 'public-https', gatewayUrl: 'https://example.com', gatewayToken: token }), /gateway_transport_unsupported/);
});

test('gateway transport accepts only an explicit numeric Tailscale IPv4 endpoint for Android peers', () => {
  const token = 'local-bearer-token-12345678901234567890';
  assert.doesNotThrow(() => createOrchestrator({ provider: 'heavenzfire-api', gatewayTransport: 'tailnet-ip', gatewayUrl: 'http://100.64.0.10:18796', gatewayToken: token }));
  assert.doesNotThrow(() => createOrchestrator({ provider: 'heavenzfire-api', gatewayTransport: 'tailnet-ip', gatewayUrl: 'http://100.127.255.254:18796', gatewayToken: token }));
  assert.throws(() => createOrchestrator({ provider: 'heavenzfire-api', gatewayTransport: 'tailnet-ip', gatewayUrl: 'http://100.64.0.10:18796', gatewayToken: 'short-token' }), /gateway_tailnet_token_minimum_32_characters/);
  for (const url of ['http://192.168.1.20:18796', 'http://100.128.0.1:18796', 'http://100.63.255.255:18796', 'https://100.64.0.10:18796', 'http://100.64.0.10:18797', 'http://worker.example.ts.net:18796']) {
    assert.throws(() => createOrchestrator({ provider: 'heavenzfire-api', gatewayTransport: 'tailnet-ip', gatewayUrl: url, gatewayToken: token }), /gateway_tailnet_ip_requires_http_tailscale_ipv4/);
  }
});

test('gateway adapter sends authenticated provider/model provenance and captures request ID', async () => {
  let captured;
  const result = await invokeGatewayRuntime({
    agent: { id: 'adversarial-reviewer', objective: 'Try to falsify the claim.' },
    goal: 'Review commit abcdef.',
    model: 'gpt-test-model',
    gatewayUrl: 'http://127.0.0.1:18796',
    gatewayToken: 'local-bearer-token-12345678901234567890',
    gatewayProvider: 'openai',
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({
          id: 'hf-request-123',
          model: 'gpt-test-model',
          choices: [{ message: { content: 'Independent review proposal.' } }]
        })
      };
    }
  });

  assert.equal(captured.url, 'http://127.0.0.1:18796/v1/chat/completions');
  assert.equal(captured.options.headers.authorization, 'Bearer local-bearer-token-12345678901234567890');
  assert.equal(captured.options.redirect, 'error');
  assert.equal(captured.body.provider, 'openai');
  assert.equal(captured.body.model, 'gpt-test-model');
  assert.equal(result.state, 'completed');
  assert.equal(result.provider, 'openai');
  assert.equal(result.providerRequestId, 'hf-request-123');
  assert.equal(result.output, 'Independent review proposal.');
});

test('gateway adapter fails closed on authentication and empty-response errors', async () => {
  const base = {
    agent: { id: 'builder', objective: 'Implement a scoped patch.' },
    goal: 'Build.',
    model: 'gpt-test-model',
    gatewayUrl: 'http://127.0.0.1:18796',
    gatewayToken: 'local-bearer-token-12345678901234567890',
    gatewayProvider: 'openai'
  };
  const unauthorized = await invokeGatewayRuntime({
    ...base,
    fetchImpl: async () => ({ ok: false, status: 401 })
  });
  assert.equal(unauthorized.state, 'failed');
  assert.equal(unauthorized.error, 'gateway_unauthorized');

  const empty = await invokeGatewayRuntime({
    ...base,
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [] }) })
  });
  assert.equal(empty.state, 'failed');
  assert.equal(empty.error, 'gateway_empty_response');
});

test('tailnet IP gateway health identifies direct transport without exposing the bearer token', async () => {
  await withServer({
    provider: 'heavenzfire-api',
    gatewayTransport: 'tailnet-ip',
    gatewayUrl: 'http://100.64.0.10:18796',
    gatewayToken: 'local-bearer-token-12345678901234567890',
    gatewayProvider: 'openai',
    model: 'gpt-test-model'
  }, async base => {
    const response = await fetch(base + '/health');
    const health = await response.json();
    assert.equal(health.gatewayTransport, 'tailnet-ip');
    assert.equal(health.execution, 'authenticated-tailnet-ip-heavenzfire-api');
    assert.equal(JSON.stringify(health).includes('local-bearer-token'), false);
  });
});

test('tailnet gateway health identifies HTTPS transport without exposing the bearer token', async () => {
  await withServer({
    provider: 'heavenzfire-api',
    gatewayTransport: 'tailnet-https',
    gatewayUrl: 'https://arm64-worker.example-tailnet.ts.net',
    gatewayToken: 'local-bearer-token-12345678901234567890',
    gatewayProvider: 'openai',
    model: 'gpt-test-model'
  }, async base => {
    const response = await fetch(base + '/health');
    const health = await response.json();
    assert.equal(health.gatewayTransport, 'tailnet-https');
    assert.equal(health.execution, 'authenticated-tailnet-https-heavenzfire-api');
    assert.equal(JSON.stringify(health).includes('local-bearer-token'), false);
  });
});

test('health reports the selected authenticated gateway provider without exposing its token', async () => {
  await withServer({
    provider: 'heavenzfire-api',
    gatewayUrl: 'http://127.0.0.1:18796',
    gatewayToken: 'local-bearer-token-12345678901234567890',
    gatewayProvider: 'openai',
    model: 'gpt-test-model'
  }, async base => {
    const response = await fetch(base + '/health');
    const health = await response.json();
    assert.equal(health.provider, 'openai');
    assert.equal(health.model, 'gpt-test-model');
    assert.equal(health.execution, 'authenticated-loopback-heavenzfire-api');
    assert.equal(JSON.stringify(health).includes('local-bearer-token'), false);
  });
});


test('task scheduler dispatches all role calls through the authenticated HeavenzFire API adapter', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-gateway-scheduler-test-'));
  let calls = 0;
  const app = createOrchestrator({
    port: 0,
    ledgerPath: path.join(directory, 'tasks.jsonl'),
    approvalVerifier: testApprovalVerifier,
    provider: 'heavenzfire-api',
    gatewayUrl: 'http://127.0.0.1:18796',
    gatewayToken: 'local-bearer-token-12345678901234567890',
    gatewayProvider: 'openai',
    model: 'gpt-test-model',
    fetchImpl: async (_url, options) => {
      calls += 1;
      assert.equal(options.headers.authorization, 'Bearer local-bearer-token-12345678901234567890');
      const request = JSON.parse(options.body);
      assert.equal(request.provider, 'openai');
      assert.equal(request.model, 'gpt-test-model');
      return {
        ok: true,
        json: async () => ({
          id: 'gateway-request-' + calls,
          model: 'gpt-test-model',
          choices: [{ message: { content: 'gateway-result-' + calls } }]
        })
      };
    }
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  const base = 'http://127.0.0.1:' + address.port;
  try {
    const created = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'Exercise the hosted model adapter.' })
    });
    const task = (await created.json()).task;
    await fetch(base + '/api/tasks/' + task.id + '/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(taskApprovalPayload(task.id, 'Exercise the hosted model adapter.'))
    });
    const response = await fetch(base + '/api/tasks/' + task.id + '/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(response.status, 200);
    const result = (await response.json()).task;
    assert.equal(calls, 16);
    assert.equal(result.results.length, 16);
    assert.ok(result.results.every(item => item.provider === 'openai'));
    assert.equal(result.execution.provider, 'openai');
    assert.equal(result.execution.model, 'gpt-test-model');
    assert.equal(result.execution.providerRequestIds.length, 16);
    assert.equal(result.consensus.decision, 0);
    assert.equal(result.state, 'completed');
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('PeerLink provider requires authenticated hub configuration and reports remote inference mode', async () => {
  assert.throws(() => createOrchestrator({ provider: 'peerlink', peerLinkUrl: 'http://192.168.1.2:18990', peerLinkToken: 'x'.repeat(40) }), /peerlink_url_must_be_https/);
  assert.throws(() => createOrchestrator({ provider: 'peerlink', peerLinkUrl: 'http://127.0.0.1:18990', peerLinkToken: 'short' }), /peerlink_bearer_token_required/);
  await withServer({
    provider: 'peerlink',
    peerLinkUrl: 'http://127.0.0.1:18990',
    peerLinkToken: 'peerlink-test-token-12345678901234567890',
    model: 'heavenzfire-qwen'
  }, async base => {
    const response = await fetch(base + '/health');
    const health = await response.json();
    assert.equal(health.provider, 'peerlink');
    assert.equal(health.model, 'heavenzfire-qwen');
    assert.equal(health.execution, 'authenticated-peerlink-remote-inference');
    assert.equal(JSON.stringify(health).includes('peerlink-test-token'), false);
  });
});

test('task scheduler dispatches all 16 roles through the authenticated PeerLink provider', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-peerlink-scheduler-test-'));
  let submissions = 0;
  const app = createOrchestrator({
    port: 0,
    ledgerPath: path.join(directory, 'tasks.jsonl'),
    approvalVerifier: testApprovalVerifier,
    provider: 'peerlink',
    peerLinkUrl: 'http://127.0.0.1:18990',
    peerLinkToken: 'peerlink-test-token-12345678901234567890',
    model: 'heavenzfire-qwen',
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      assert.equal(options.headers.authorization, 'Bearer peerlink-test-token-12345678901234567890');
      if (parsed.pathname === '/v1/tasks' && options.method === 'POST') {
        submissions += 1;
        const body = JSON.parse(options.body);
        assert.equal(body.task.type, 'inference.chat');
        assert.equal(body.task.payload.model, 'heavenzfire-qwen');
        return Response.json({ ok: true, task: { task_id: body.task.task_id } }, { status: 202 });
      }
      if (/^\/v1\/tasks\/uf-[0-9a-f-]{36}$/.test(parsed.pathname) && options.method === 'GET') {
        return Response.json({
          ok: true,
          task: {
            status: 'COMPLETED',
            peer_id: 'arm64-test-node',
            result: { model: 'heavenzfire-qwen', response: 'peerlink-role-result-' + submissions }
          }
        });
      }
      throw new Error('unexpected_peerlink_test_route:' + parsed.pathname);
    }
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = app.server.address();
  const base = 'http://127.0.0.1:' + address.port;
  try {
    const goal = 'Exercise all 16 orchestrator roles through authenticated PeerLink.';
    const created = await fetch(base + '/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal })
    });
    const task = (await created.json()).task;
    const approved = await fetch(base + '/api/tasks/' + task.id + '/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(taskApprovalPayload(task.id, goal))
    });
    assert.equal(approved.status, 200);
    const response = await fetch(base + '/api/tasks/' + task.id + '/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(response.status, 200);
    const result = (await response.json()).task;
    assert.equal(submissions, 16);
    assert.equal(result.results.length, 16);
    assert.ok(result.results.every(item => item.provider === 'peerlink'));
    assert.equal(result.execution.provider, 'peerlink');
    assert.equal(result.execution.model, 'heavenzfire-qwen');
    assert.equal(result.execution.providerRequestIds.length, 16);
    assert.equal(result.consensus.decision, 0);
    assert.equal(result.state, 'completed');
  } finally {
    await new Promise(resolve => app.server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

