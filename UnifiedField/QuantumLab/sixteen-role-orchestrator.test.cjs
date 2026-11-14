'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLES, validateEndpoint, parseRoleModelsJson, assessRoleSpecificity, makePrompt, runSixteenRoleField } = require('./sixteen-role-orchestrator.cjs');

function validRoleResponse(roleId) {
  const responses = {
    architect: 'Component boundaries define interface ownership and concrete contracts across the repository architecture.',
    planner: 'Ordered steps identify dependencies, checkpoints, and implementation order for the repository work.',
    researcher: 'Evidence sources distinguish supplied facts, unknowns, and assumptions for this repository assessment.',
    requirements: 'Acceptance criteria define measurable pass/fail outcomes and testable outcomes for the requested goal.',
    designer: 'API schema contracts define component interfaces and failure behavior across the integration.',
    builder: [
      'FILE: UnifiedField/QuantumLab/sixteen-role-orchestrator.cjs | PROPOSED CHANGE: add bounded logic | DEPENDENCIES: none | VERIFICATION: node test',
      'FILE: UnifiedField/QuantumLab/sixteen-role-orchestrator.test.cjs | PROPOSED CHANGE: add regression coverage | DEPENDENCIES: a.cjs | VERIFICATION: node test',
      'FILE: UnifiedField/QuantumLab/sixteen-role-orchestrator.cjs | PROPOSED CHANGE: document operation | DEPENDENCIES: a.cjs | VERIFICATION: review docs'
    ].join('\n'),
    integrator: 'Integration wiring identifies contract mismatches and compatibility requirements across components.',
    'test-engineer': 'Executable tests define test cases, expected assertions, and reproducible inputs for validation.',
    'security-reviewer': 'Threats at trust boundaries require specific mitigation controls and review evidence.',
    'adversarial-verifier': 'Negative tests cover abuse cases and falsifiable failure conditions for the implementation.',
    'reliability-engineer': 'Timeouts, retries, recovery, and idempotency define crash behavior and safe restart handling.',
    'performance-analyst': 'Latency, throughput, token usage, memory usage, and benchmarks define measurable performance.',
    documentation: 'Operator runbook gives usage instructions and documents limitations for safe operation.',
    'evidence-auditor': 'Claims are classified verified, unverified, or contradicted with evidence references and provenance.',
    'release-manager': 'Release gates and rollback conditions define the go/no-go decision for deployment readiness.',
    synthesis: 'Cross-role agreement, conflicts, risks, and prioritized actions are summarized for synthesis.'
  };
  return responses[roleId];
}

test('registry has sixteen unique roles with resolvable dependencies', () => {
  assert.equal(ROLES.length, 16);
  const ids = new Set(ROLES.map(role => role.id));
  assert.equal(ids.size, 16);
  for (const role of ROLES) {
    assert.ok(Array.isArray(role.dependsOn));
    for (const dependency of role.dependsOn) assert.ok(ids.has(dependency), role.id + ' missing ' + dependency);
    assert.ok(!role.dependsOn.includes(role.id));
  }
});

test('endpoint guard permits loopback and rejects remote destinations and credentials', () => {
  assert.equal(validateEndpoint('http://127.0.0.1:11800').hostname, '127.0.0.1');
  assert.throws(() => validateEndpoint('https://example.com'), /loopback only/);
  assert.throws(() => validateEndpoint('http://user:pass@127.0.0.1:11800'), /credentials/);
  assert.throws(() => validateEndpoint('file:///tmp/model'), /HTTP\(S\) loopback/);
});

test('runs all roles through the DAG with bounded concurrency and retains semantic review', async () => {
  let active = 0;
  let peak = 0;
  const called = [];
  const context = 'FILE: UnifiedField/QuantumLab/sixteen-role-orchestrator.cjs\\nTEST: role-specific repair gate';
  const result = await runSixteenRoleField({
    goal: 'Test a bounded local orchestration run.',
    context,
    endpoint: 'http://127.0.0.1:11800',
    maxParallel: 2,
    maxTokens: 128,
    invoke: async task => {
      assert.ok(task.prompt.includes(context));
      active += 1;
      peak = Math.max(peak, active);
      called.push(task.roleId);
      await new Promise(resolve => setTimeout(resolve, 3));
      active -= 1;
      return { response: validRoleResponse(task.roleId), finishReason: 'stop', durationMs: 3 };
    }
  });
  assert.equal(result.roleCount, 16);
  assert.equal(result.contextChars, context.length);
  assert.match(result.contextSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.counts.completed, 16);
  assert.equal(result.counts.failed, 0);
  assert.equal(result.counts.blocked, 0);
  assert.ok(peak <= 2);
  assert.equal(called.length, 16);
  assert.equal(result.qualityGate.passed, true);
  assert.equal(result.qualityGate.structuralChecksOnly, true);
  assert.equal(result.qualityGate.roleSpecificityPassed, true);
  assert.equal(result.qualityGate.semanticReviewRequired, true);
  assert.equal(result.status, 'review_required');
  assert.equal(result.ok, false);
});

test('routes roles across configured local models and emits live progress events', async () => {
  const events = [];
  const calls = [];
  const roleModels = {
    architect: 'qwen2.5:0.5b',
    planner: 'heavenzfire-runtime:latest',
    researcher: 'heavenzfire:latest',
    requirements: 'llama3.2:1b'
  };
  const result = await runSixteenRoleField({
    goal: 'Verify per-role model routing and observable progress.',
    endpoint: 'http://127.0.0.1:11434',
    model: 'qwen2.5:0.5b',
    roleModels,
    maxParallel: 2,
    onProgress: event => events.push(event),
    invoke: async task => {
      calls.push({ roleId: task.roleId, model: task.model });
      return {
        response: validRoleResponse(task.roleId),
        finishReason: 'stop',
        durationMs: 5,
        model: task.roleId === 'researcher' ? 'provider-reported-alias' : task.model
      };
    }
  });

  assert.equal(result.counts.completed, 16);
  assert.equal(calls.length, 16);
  for (const [roleId, model] of Object.entries(roleModels)) {
    assert.equal(calls.find(call => call.roleId === roleId).model, model);
    assert.equal(result.roleRecords.find(record => record.roleId === roleId).model, model);
  }
  const researcherRecord = result.roleRecords.find(record => record.roleId === 'researcher');
  assert.equal(researcherRecord.model, roleModels.researcher);
  assert.equal(researcherRecord.providerModel, 'provider-reported-alias');
  assert.deepEqual(result.modelsUsed.sort(), [
    'heavenzfire-runtime:latest', 'heavenzfire:latest', 'llama3.2:1b', 'qwen2.5:0.5b'
  ]);
  assert.ok(events.some(event => event.type === 'run_started'));
  assert.equal(events.filter(event => event.type === 'role_started').length, 16);
  assert.equal(events.filter(event => event.type === 'role_completed').length, 16);
  assert.ok(events.some(event => event.type === 'run_finished'));
});

test('rejects unknown role-model mappings and invalid timeouts before dispatch', async () => {
  const invoke = async () => { throw new Error('must not dispatch'); };
  await assert.rejects(runSixteenRoleField({
    goal: 'invalid role mapping', roleModels: { not_a_role: 'model' }, invoke
  }), /unknown role/);
  await assert.rejects(runSixteenRoleField({
    goal: 'invalid timeout', timeoutMs: 999, invoke
  }), /timeoutMs must be 1000..120000/);
});


test('explicit empty role-model CLI value is rejected instead of falling back to environment', () => {
  assert.throws(
    () => parseRoleModelsJson({ 'role-models-json': '' }, '{"architect":"environment-model"}'),
    /valid JSON object/
  );
  assert.deepEqual(
    parseRoleModelsJson({}, '{"architect":"environment-model"}'),
    { architect: 'environment-model' }
  );
});

test('refusal detection handles leading whitespace', async () => {
  const result = await runSixteenRoleField({
    goal: 'Check whitespace-tolerant refusal handling.',
    invoke: async () => ({ response: '   I cannot assist with that request.', finishReason: 'stop' })
  });
  assert.equal(result.counts.reviewRequired, 1);
  assert.equal(result.counts.blocked, 15);
  assert.equal(result.roleRecords[0].refusal, true);
});

test('truncated architect output receives one bounded repair attempt and still fails closed when retry is truncated', async () => {
  const called = [];
  const result = await runSixteenRoleField({
    goal: 'Check truncation repair handling.',
    maxTokens: 128,
    invoke: async task => {
      called.push(task);
      return { response: 'partial output', finishReason: 'length' };
    }
  });
  assert.equal(result.counts.reviewRequired, 1);
  assert.equal(result.counts.blocked, 15);
  assert.equal(result.counts.completed, 0);
  assert.equal(called.length, 2);
  assert.equal(called[0].roleId, 'architect');
  assert.equal(called[1].roleId, 'architect');
  assert.equal(called[1].repairAttempt, 1);
  assert.equal(called[1].maxTokens, 192);
  assert.equal(result.roleRecords[0].repair.attempted, true);
  assert.equal(result.roleRecords[0].repair.reason, 'truncated_output');
  assert.equal(result.qualityGate.passed, false);
});

test('role-specificity failure triggers one targeted repair and opens the quality gate only after all roles pass', async () => {
  const calls = [];
  const result = await runSixteenRoleField({
    goal: 'Verify role-specific repair and acceptance.',
    maxParallel: 1,
    invoke: async task => {
      calls.push(task);
      if (task.roleId === 'architect' && !task.repairAttempt) {
        return { response: 'A generic summary with no architect-specific deliverable.', finishReason: 'stop' };
      }
      return { response: validRoleResponse(task.roleId), finishReason: 'stop', durationMs: 4 };
    }
  });
  assert.equal(calls.filter(task => task.roleId === 'architect').length, 2);
  assert.equal(calls.find(task => task.roleId === 'architect' && task.repairAttempt).temperature, 0);
  assert.equal(result.counts.completed, 16);
  assert.equal(result.counts.failed, 0);
  assert.equal(result.counts.blocked, 0);
  assert.equal(result.qualityGate.passed, true);
  assert.equal(result.qualityGate.roleSpecificityPassed, true);
  assert.equal(result.roleRecords[0].repair.reason, 'role_specificity');
  assert.equal(result.roleRecords[0].roleSpecificity.roleSpecificityPassed, true);
});

test('role-specific acceptance requires substantive output and at least two literal anchors', () => {
  assert.equal(assessRoleSpecificity('architect', validRoleResponse('architect')).roleSpecificityPassed, true);
  assert.equal(assessRoleSpecificity('requirements', 'Acceptance criteria are required.').roleSpecificityPassed, false);
  assert.equal(
    assessRoleSpecificity('requirements', 'Acceptance criteria are required, and this longer sentence still contains only one required signal while omitting any measurable pass or fail threshold.').roleSpecificityPassed,
    false
  );
});

test('builder prompt contains the exact approved three-row output contract', () => {
  const builder = ROLES.find(role => role.id === 'builder');
  const prompt = makePrompt(builder, 'Review the current QuantumLab orchestrator.', []);
  assert.match(prompt, /Return exactly three non-empty lines/);
  assert.ok(prompt.includes('UnifiedField/QuantumLab/sixteen-role-orchestrator.cjs'));
  assert.ok(prompt.includes('UnifiedField/QuantumLab/sixteen-role-orchestrator.test.cjs'));
  assert.match(prompt, /Do not repeat or paraphrase upstream role responses/);
});

test('builder specificity requires exactly three complete change rows and approved target paths', () => {
  assert.equal(assessRoleSpecificity('builder', validRoleResponse('builder')).roleSpecificityPassed, true);
  assert.equal(assessRoleSpecificity('builder', 'FILE: x | PROPOSED CHANGE: y | DEPENDENCIES: z | VERIFICATION: q').roleSpecificityPassed, false);
  const inventedPath = Array(3).fill(
    'FILE: UnifiedField/QuantumLab/unsafe.cjs | PROPOSED CHANGE: x | DEPENDENCIES: none | VERIFICATION: node test'
  ).join('\n');
  assert.equal(assessRoleSpecificity('builder', inventedPath).roleSpecificityPassed, false);
});

test('refusal output is not counted as a completed role', async () => {
  const result = await runSixteenRoleField({
    goal: 'Check refusal handling.',
    invoke: async () => ({ response: 'I cannot assist with that request.', finishReason: 'stop' })
  });
  assert.equal(result.counts.reviewRequired, 1);
  assert.equal(result.counts.blocked, 15);
  assert.equal(result.roleRecords[0].refusal, true);
});

test('empty and refusal outputs do not trigger a repair attempt', async () => {
  for (const response of ['', 'I cannot assist with that request.']) {
    let calls = 0;
    const result = await runSixteenRoleField({
      goal: 'Verify repair does not retry empty or refusal output.',
      invoke: async () => {
        calls += 1;
        return { response, finishReason: 'stop' };
      }
    });
    assert.equal(calls, 1);
    assert.equal(result.counts.reviewRequired, 1);
    assert.equal(result.counts.blocked, 15);
    assert.equal(result.roleRecords[0].repair.attempted, false);
  }
});

test('failed targeted repair is recorded and blocks dependent roles without a second retry', async () => {
  let calls = 0;
  const result = await runSixteenRoleField({
    goal: 'Verify repair failure is bounded and auditable.',
    invoke: async task => {
      calls += 1;
      if (task.repairAttempt) throw new Error('synthetic repair failure');
      return { response: 'Generic response without an architect deliverable.', finishReason: 'stop' };
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.counts.reviewRequired, 1);
  assert.equal(result.counts.blocked, 15);
  assert.equal(result.counts.failed, 0);
  assert.equal(result.roleRecords[0].repair.attempts, 2);
  assert.match(result.roleRecords[0].repair.retryError, /synthetic repair failure/);
  assert.equal(result.qualityGate.passed, false);
});

test('worker exceptions are recorded as failures and never become success', async () => {
  const result = await runSixteenRoleField({
    goal: 'Check worker crash handling.',
    invoke: async () => { throw new Error('synthetic worker crash'); }
  });
  assert.equal(result.counts.failed, 1);
  assert.equal(result.counts.blocked, 15);
  assert.match(result.roleRecords[0].error, /synthetic worker crash/);
});
