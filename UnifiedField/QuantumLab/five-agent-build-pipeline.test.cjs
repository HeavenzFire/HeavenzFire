'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AGENTS, MODEL, runFiveAgentBuild } = require('./five-agent-build-pipeline.cjs');

test('five-role build pipeline executes each logical role sequentially through the fixed local model', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Result for role ' + calls.length } }] }) };
  };
  const result = await runFiveAgentBuild({
    objective: 'Build and verify a reliable Unified Field agent launch workflow.',
    fetchImpl
  });
  assert.equal(calls.length, 5);
  assert.deepEqual(result.agents.map(agent => agent.id), AGENTS.map(agent => agent.id));
  assert.equal(result.completed, 5);
  assert.equal(result.total, 5);
  assert.equal(result.ok, true);
  assert.equal(result.independent_processes, false);
  assert.equal(result.code_executed, false);
  assert.equal(result.model, MODEL);
  assert.ok(calls.every(call => call.url === 'http://127.0.0.1:11800/v1/chat/completions'));
  assert.ok(calls.every(call => call.body.model === MODEL && call.body.stream === false));
  assert.ok(calls[4].body.messages[1].content.includes('prior_role_outputs'));
});

test('pipeline records individual inference failures and continues to later roles', async () => {
  let count = 0;
  const result = await runFiveAgentBuild({
    objective: 'Audit and improve the Unified Field build workflow.',
    fetchImpl: async () => {
      count += 1;
      if (count === 2) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    }
  });
  assert.equal(result.completed, 4);
  assert.equal(result.ok, false);
  assert.equal(result.agents[1].status, 'failed');
  assert.equal(count, 5);
});

test('pipeline rejects undersized objectives and non-loopback inference URLs', async () => {
  await assert.rejects(() => runFiveAgentBuild({ objective: 'too short', fetchImpl: async () => { throw Error('must not call'); } }), /20-500/);
  await assert.rejects(() => runFiveAgentBuild({ objective: 'Build a reliable agent launch workflow.', inferenceBaseUrl: 'http://example.com/v1', fetchImpl: async () => { throw Error('must not call'); } }), /loopback/);
});
