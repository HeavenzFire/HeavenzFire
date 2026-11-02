'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const AGENTS = Object.freeze([
  ['coordinator', 'Coordinator', 'Decompose the mission into work packages, dependencies, and acceptance criteria.'],
  ['architecture', 'Architecture', 'Review system boundaries, interfaces, data flow, and architectural trade-offs.'],
  ['security', 'Security', 'Review trust boundaries, authentication, authorization, injection, secrets, and least privilege.'],
  ['reliability', 'Reliability', 'Review timeouts, retries, idempotency, recovery, and failure isolation.'],
  ['testing', 'Testing', 'Design deterministic tests, edge cases, and measurable acceptance criteria.'],
  ['performance', 'Performance', 'Identify measurable latency, throughput, memory, and scheduling improvements.'],
  ['governance', 'Resource Governance', 'Review provider budgets, concurrency, quotas, and cost controls.'],
  ['persistence', 'Persistence', 'Review durable state, schema evolution, atomicity, and recovery.'],
  ['observability', 'Observability', 'Define structured events, correlation IDs, metrics, and useful diagnostics.'],
  ['api', 'API Integration', 'Review provider routing, request contracts, response handling, and compatibility.'],
  ['task-ledger', 'Task Ledger', 'Review task lifecycle, dependencies, deduplication, and replay safety.'],
  ['privacy', 'Privacy', 'Minimize data collection and prevent sensitive information from leaking into logs or outputs.'],
  ['documentation', 'Documentation', 'Produce accurate setup, operations, and troubleshooting guidance.'],
  ['integration', 'Integration', 'Identify concrete integration seams with existing Unified Field components.'],
  ['independent-review', 'Independent Review', 'Challenge assumptions, identify missing evidence, and rank risks.'],
  ['implementation', 'Implementation Planning', 'Turn verified findings into small, testable implementation work packages.']
].map(([id, role, objective], index) => Object.freeze({ id, role, objective, index })));

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function buildPrompt(agent, mission, context) {
  const shared = context ? '\n\nShared context from the operator:\n' + context : '';
  return [
    'You are a specialist worker in the HeavenzFire Unified Field agent swarm.',
    'Agent: ' + agent.id + ' (' + agent.role + ')',
    'Objective: ' + agent.objective,
    '',
    'Mission:',
    mission,
    shared,
    '',
    'Rules:',
    '- Use only the mission and context supplied here; do not claim repository or machine access.',
    '- Separate observed facts, assumptions, and recommendations.',
    '- Never invent test results, files, credentials, or capabilities.',
    '- Do not execute actions or request secrets.',
    '- Return concise sections: FINDINGS, EVIDENCE_NEEDED, RECOMMENDATIONS, ACCEPTANCE_TESTS.'
  ].join('\n');
}

function createAgentSwarm(options = {}) {
  if (typeof options.dispatch !== 'function') {
    throw new TypeError('dispatch must be a function');
  }

  const maxAgents = clampInteger(options.maxAgents ?? 16, 1, 16, 'maxAgents');
  const maxConcurrency = clampInteger(options.maxConcurrency ?? 16, 1, 16, 'maxConcurrency');
  const maxMissionChars = options.maxMissionChars ?? 12000;
  const maxContextChars = options.maxContextChars ?? 8000;
  const maxOutputChars = options.maxOutputChars ?? 12000;
  const stateDir = options.stateDir || process.env.HF_SWARM_STATE_DIR || '';

  async function run(input) {
    if (!input || typeof input.mission !== 'string' || !input.mission.trim()) {
      throw Object.assign(new Error('mission must be a non-empty string'), { status: 400, code: 'invalid_mission' });
    }
    const mission = input.mission.trim();
    if (mission.length > maxMissionChars) {
      throw Object.assign(new Error('mission exceeds the configured character limit'), { status: 413, code: 'mission_too_large' });
    }
    const context = typeof input.context === 'string' ? input.context : '';
    if (context.length > maxContextChars) {
      throw Object.assign(new Error('context exceeds the configured character limit'), { status: 413, code: 'context_too_large' });
    }

    const requested = Number.isInteger(input.maxAgents) ? input.maxAgents : maxAgents;
    const agentCount = clampInteger(requested, 1, maxAgents, 'maxAgents');
    const concurrency = Math.min(
      clampInteger(Number.isInteger(input.concurrency) ? input.concurrency : maxConcurrency, 1, maxConcurrency, 'concurrency'),
      agentCount
    );
    const selected = AGENTS.slice(0, agentCount);
    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const results = new Array(selected.length);
    let cursor = 0;
    let active = 0;
    let peakActive = 0;

    async function worker() {
      while (true) {
        const index = cursor++;
        if (index >= selected.length) return;
        const agent = selected[index];
        const prompt = buildPrompt(agent, mission, context);
        const started = Date.now();
        active += 1;
        peakActive = Math.max(peakActive, active);
        try {
          const response = await options.dispatch({
            provider: input.provider,
            model: input.model,
            messages: [
              { role: 'system', content: 'You are a rigorous engineering specialist. Follow the agent objective and output contract.' },
              { role: 'user', content: prompt }
            ],
            agent: { id: agent.id, role: agent.role }
          });
          const output = typeof response === 'string' ? response : response?.text;
          if (typeof output !== 'string' || !output.trim()) {
            throw new Error('provider returned an empty response');
          }
          const boundedOutput = output.slice(0, maxOutputChars);
          results[index] = {
            agentId: agent.id,
            role: agent.role,
            status: 'completed',
            elapsedMs: Date.now() - started,
            output: boundedOutput,
            outputSha256: sha256(boundedOutput)
          };
        } catch (error) {
          results[index] = {
            agentId: agent.id,
            role: agent.role,
            status: 'failed',
            elapsedMs: Date.now() - started,
            error: String(error?.message || 'agent dispatch failed').slice(0, 500)
          };
        } finally {
          active -= 1;
        }
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const completed = results.filter(item => item.status === 'completed').length;
    const report = {
      schemaVersion: 1,
      runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      mission,
      provider: input.provider || 'default',
      model: input.model || 'default',
      plannedAgents: selected.length,
      completedAgents: completed,
      failedAgents: selected.length - completed,
      concurrency,
      peakConcurrency: peakActive,
      status: completed === selected.length ? 'completed' : completed > 0 ? 'partial' : 'failed',
      results
    };

    if (stateDir) {
      await fs.mkdir(stateDir, { recursive: true });
      const destination = path.join(stateDir, runId + '.json');
      const temporary = destination + '.' + crypto.randomUUID() + '.tmp';
      try {
        await fs.writeFile(temporary, JSON.stringify(report, null, 2), { encoding: 'utf8', flag: 'wx' });
        await fs.rename(temporary, destination);
        report.evidenceFile = destination;
        report.reportSha256 = sha256(JSON.stringify(report));
      } finally {
        await fs.rm(temporary, { force: true }).catch(() => {});
      }
    }

    return report;
  }

  return Object.freeze({ run });
}

function clampInteger(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw Object.assign(new Error(name + ' must be an integer between ' + min + ' and ' + max), { status: 400, code: 'invalid_' + name });
  }
  return value;
}

module.exports = { AGENTS, createAgentSwarm, sha256 };
