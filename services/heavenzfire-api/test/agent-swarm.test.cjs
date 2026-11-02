'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');
const { AGENTS, createAgentSwarm } = require('../agent-swarm.cjs');

test('defines sixteen distinct specialist roles', () => {
  assert.equal(AGENTS.length, 16);
  assert.equal(new Set(AGENTS.map(agent => agent.id)).size, 16);
});

test('runs bounded parallel workers and persists hash-verifiable evidence', async t => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hf-swarm-'));
  t.after(() => fs.rm(stateDir, { recursive: true, force: true }));
  let active = 0;
  let peak = 0;

  const swarm = createAgentSwarm({
    maxAgents: 16,
    maxConcurrency: 3,
    stateDir,
    dispatch: async ({ agent }) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      return { text: 'RESULT_' + agent.id };
    }
  });

  const report = await swarm.run({
    mission: 'Assess the test fixture.',
    maxAgents: 8,
    concurrency: 3,
    provider: 'test',
    model: 'fixture'
  });

  assert.equal(report.status, 'completed');
  assert.equal(report.plannedAgents, 8);
  assert.equal(report.completedAgents, 8);
  assert.equal(report.peakConcurrency, peak);
  assert.ok(peak <= 3);
  assert.ok(report.evidenceFile);
  const saved = JSON.parse(await fs.readFile(report.evidenceFile, 'utf8'));
  assert.equal(saved.results.length, 8);
  assert.match(saved.results[0].outputSha256, /^[a-f0-9]{64}$/);
});

test('runs all sixteen specialist agents concurrently when configured', async () => {
  let active = 0;
  let peak = 0;
  const swarm = createAgentSwarm({
    maxAgents: 16,
    maxConcurrency: 16,
    dispatch: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 20));
      active -= 1;
      return 'PARALLEL_OK';
    }
  });
  const report = await swarm.run({
    mission: 'Verify sixteen-way parallel execution.',
    maxAgents: 16,
    concurrency: 16
  });
  assert.equal(report.status, 'completed');
  assert.equal(report.completedAgents, 16);
  assert.equal(report.peakConcurrency, 16);
  assert.equal(peak, 16);
});

test('isolates individual agent failures and reports partial completion', async () => {
  const swarm = createAgentSwarm({
    maxAgents: 4,
    maxConcurrency: 2,
    dispatch: async ({ agent }) => {
      if (agent.id === 'architecture') throw new Error('fixture failure');
      return 'OK_' + agent.id;
    }
  });
  const report = await swarm.run({ mission: 'Exercise failure isolation.', maxAgents: 4, concurrency: 2 });
  assert.equal(report.status, 'partial');
  assert.equal(report.completedAgents, 3);
  assert.equal(report.failedAgents, 1);
  assert.equal(report.results[1].status, 'failed');
});

test('rejects invalid mission and unsafe concurrency settings', async () => {
  const swarm = createAgentSwarm({ dispatch: async () => 'unused' });
  await assert.rejects(() => swarm.run({ mission: ' ' }), { code: 'invalid_mission' });
  await assert.rejects(() => swarm.run({ mission: 'valid', concurrency: 99 }), { code: 'invalid_concurrency' });
});

test('bounds mission and context input sizes', async () => {
  const swarm = createAgentSwarm({
    dispatch: async () => 'unused',
    maxMissionChars: 10,
    maxContextChars: 5
  });
  await assert.rejects(() => swarm.run({ mission: 'this mission is too long' }), { code: 'mission_too_large' });
  await assert.rejects(() => swarm.run({ mission: 'ok', context: 'context too long' }), { code: 'context_too_large' });
});
