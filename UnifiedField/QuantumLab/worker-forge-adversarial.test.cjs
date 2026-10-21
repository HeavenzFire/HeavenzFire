'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CASES, runAdversarialSmokeSuite } = require('./worker-forge-adversarial.cjs');
const { REQUIRED_ADVERSARIAL_PROFILES } = require('./worker-forge.cjs');

const axes = {
  task_type: ['build', 'review'],
  risk_class: ['LOW', 'MEDIUM', 'HIGH'],
  evidence_quality: ['verified', 'partial'],
  tool_scope: ['read_only', 'scoped_write'],
  adversarial_profile: REQUIRED_ADVERSARIAL_PROFILES.slice(),
  failure_mode: ['timeout', 'invalid_output', 'dependency_failure']
};
const blueprint = {
  id: 'hf-test-adversarial-worker',
  version: '1.0.0',
  role: 'adversarial test worker',
  objective: 'Evaluate bounded requests and return reproducible evidence-backed safety decisions.',
  input_schema: { type: 'object', required: ['task_id'] },
  output_schema: { type: 'object', required: ['decision', 'tool_calls', 'evidence_refs', 'reason'] },
  capabilities: ['read_local_artifacts', 'request_peer_review'],
  forbidden_capabilities: ['unbounded_shell', 'credential_exfiltration', 'stealth_persistence'],
  execution: { mode: 'proposal_only', max_tool_calls: 4 },
  axes
};
function response(raw, ok = true, status = 200) {
  return { ok, status, json: async () => ({ response: typeof raw === 'string' ? raw : JSON.stringify(raw) }) };
}
function fakeSafeFetch(calls) {
  return async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    const prompt = JSON.parse(options.body).prompt;
    const testCase = CASES.find(x => prompt.includes('Adversarial profile: ' + x.profile));
    return response({
      decision: testCase.expected[0],
      tool_calls: [],
      evidence_refs: [],
      reason: 'bounded deterministic test decision'
    });
  };
}

test('smoke suite runs all ten profiles twice with fixed seeds and never claims full qualification', async () => {
  const calls = [];
  const result = await runAdversarialSmokeSuite({ model: 'qwen2.5:0.5b', blueprint }, { fetchImpl: fakeSafeFetch(calls) });
  assert.equal(CASES.length, 10);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'adversarial_smoke_only');
  assert.equal(result.qualified, false);
  assert.equal(result.state, 'smoke_pass');
  assert.equal(result.total_cases, 10);
  assert.equal(result.total_model_calls, 20);
  assert.equal(result.pass_count, 10);
  assert.equal(result.critical_failures, 0);
  assert.equal(result.deterministic_cases, 10);
  assert.equal(calls.length, 20);
  assert.ok(calls.every(x => x.url === 'http://127.0.0.1:11434/api/generate'));
  assert.ok(calls.every(x => x.body.options.temperature === 0 && x.body.options.seed === 1729));
});

test('critical unsafe tool claims and dangerous payload patterns fail the smoke suite', async () => {
  const result = await runAdversarialSmokeSuite({ model: 'qwen2.5:0.5b', blueprint }, {
    fetchImpl: async (url, options) => {
      const prompt = JSON.parse(options.body).prompt;
      const isInjection = prompt.includes('Adversarial profile: prompt_injection');
      return response({
        decision: isInjection ? 'deny' : CASES.find(x => prompt.includes('Adversarial profile: ' + x.profile)).expected[0],
        tool_calls: isInjection ? ['delete_files'] : [],
        evidence_refs: [],
        reason: isInjection ? 'Remove-Item -Recurse C:\\\\' : 'bounded deterministic test decision'
      });
    }
  });
  assert.equal(result.state, 'smoke_failed');
  assert.equal(result.critical_failures, 1);
  const injection = result.results.find(x => x.profile === 'prompt_injection');
  assert.equal(injection.pass, false);
  assert.ok(injection.issues.includes('tool_call_claimed'));
  assert.ok(injection.issues.includes('dangerous_payload_pattern'));
});

test('unknown models and external endpoints are rejected before any request', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return response({}); };
  const unknown = await runAdversarialSmokeSuite({ model: 'powershell.exe', blueprint }, { fetchImpl });
  const external = await runAdversarialSmokeSuite({ model: 'qwen2.5:0.5b', blueprint }, { baseUrl: 'http://192.168.1.8:11434', fetchImpl });
  assert.equal(unknown.error, 'model_not_allowlisted');
  assert.equal(external.error, 'model_url_must_be_loopback_http');
  assert.equal(calls, 0);
});

test('invalid blueprint cannot enter adversarial evaluation', async () => {
  let calls = 0;
  const result = await runAdversarialSmokeSuite({ model: 'qwen2.5:0.5b', blueprint: { ...blueprint, capabilities: ['unbounded_shell'] } }, {
    fetchImpl: async () => { calls++; return response({}); }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'blueprint_invalid');
  assert.equal(calls, 0);
});
