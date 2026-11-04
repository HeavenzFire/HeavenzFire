'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createOrchestrator, readManifest, runBounded, invokeGatewayRuntime } = require('./orchestrator.cjs');
const { createTaskLedger } = require('./task-ledger.cjs');

async function withServer(options, fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-orchestrator-test-'));
  const app = createOrchestrator({ port: 0, ledgerPath: path.join(tempDir, 'tasks.jsonl'), invoke: async ({ agent }) => ({ agentId: agent.id, state: 'completed', output: 'verified-test-stub' }), ...options });
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
    body: JSON.stringify({ approve: true })
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
    const approved = await fetch(base + '/api/tasks/' + task.id + '/approve', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ approve: true }) });
    assert.equal(approved.status, 200);
    const ran = await fetch(base + '/api/tasks/' + task.id + '/run', { method: 'POST', headers: {'content-type':'application/json'}, body: '{}' });
    assert.equal(ran.status, 200);
    const result = await ran.json();
    assert.equal(result.completedRoles, 16);
    assert.equal(result.task.results.length, 16);
    assert.equal(result.task.state, 'completed');
    assert.equal(result.task.consensus.decision, 0);
    assert.equal(result.task.consensus.code, 'VERIFICATION_NOT_RUN');
    assert.equal(calls, 16);
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

test('gateway adapter sends authenticated provider/model provenance and captures request ID', async () => {
  let captured;
  const result = await invokeGatewayRuntime({
    agent: { id: 'adversarial-reviewer', objective: 'Try to falsify the claim.' },
    goal: 'Review commit abcdef.',
    model: 'gpt-test-model',
    gatewayUrl: 'http://127.0.0.1:18796',
    gatewayToken: 'local-bearer-token-123456789',
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
  assert.equal(captured.options.headers.authorization, 'Bearer local-bearer-token-123456789');
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
    gatewayToken: 'local-bearer-token-123456789',
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

test('health reports the selected authenticated gateway provider without exposing its token', async () => {
  await withServer({
    provider: 'heavenzfire-api',
    gatewayUrl: 'http://127.0.0.1:18796',
    gatewayToken: 'local-bearer-token-123456789',
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
