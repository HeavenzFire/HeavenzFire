'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ROLES, validateEndpoint, parseRoleModelsJson, assessRoleSpecificity, runSixteenRoleField } = require('./sixteen-role-orchestrator.cjs');

function validRoleResponse(roleId) {
  const responses = {
    architect: 'Component boundaries, interface ownership, and concrete contracts are defined.',
    planner: 'Step sequence, dependencies, ordered checkpoints, and implementation order are listed.',
    researcher: 'Evidence sources, supplied facts, unknowns, and assumptions are separated.',
    requirements: 'Acceptance criteria define measurable pass/fail outcomes.',
    designer: 'API schema contracts and failure behavior are specified.',
    builder: [
      'FILE: UnifiedField/QuantumLab/sixteen-role-orchestrator.cjs | PROPOSED CHANGE: add bounded logic | DEPENDENCIES: none | VERIFICATION: node test',
      'FILE: UnifiedField/QuantumLab/sixteen-role-orchestrator.test.cjs | PROPOSED CHANGE: add regression coverage | DEPENDENCIES: a.cjs | VERIFICATION: node test',
      'FILE: UnifiedField/QuantumLab/sixteen-role-orchestrator.cjs | PROPOSED CHANGE: document operation | DEPENDENCIES: a.cjs | VERIFICATION: review docs'
    ].join('\n'),
    integrator: 'Integration wiring and contract mismatches are identified.',
    'test-engineer': 'Test cases include expected assertions and executable inputs.',
    'security-reviewer': 'Threats, trust boundaries, and mitigation controls are identified.',
    'adversarial-verifier': 'Negative tests, abuse cases, and falsifiable failure conditions are specified.',
    'reliability-engineer': 'Timeout, retry, recovery, idempotency, and crash behavior are covered.',
    'performance-analyst': 'Latency, throughput, token and memory benchmarks are measurable.',
    documentation: 'Operator runbook, usage instructions, and limitations are documented.',
    'evidence-auditor': 'Claims are classified verified, unverified, or contradicted with evidence references.',
    'release-manager': 'Release gates, rollback conditions, and go/no-go decision are defined.',
    synthesis: 'Cross-role agreement, conflicts, risks, and prioritized next actions are summarized.'
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
  const result = await runSixteenRoleField({
    goal: 'Test a bounded local orchestration run.',
    endpoint: 'http://127.0.0.1:11800',
    maxParallel: 2,
    maxTokens: 128,
    invoke: async task => {
      active += 1;
      peak = Math.max(peak, active);
      called.push(task.roleId);
      await new Promise(resolve => setTimeout(resolve, 3));
      active -= 1;
      return { response: validRoleResponse(task.roleId), finishReason: 'stop', durationMs: 3 };
    }
  });
  assert.equal(result.roleCount, 16);
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

test('builder specificity requires exactly three complete change rows', () => {
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
