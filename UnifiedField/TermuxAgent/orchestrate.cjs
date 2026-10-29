'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { askLocal, validateEndpoint } = require('./agent.cjs');
const MAX_TASKS = 64, MAX_PARALLEL = 16, MAX_TASK_CHARS = 8000;

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || !Array.isArray(plan.tasks)) throw new Error('Plan must be a JSON object with a tasks array');
  if (plan.tasks.length < 1 || plan.tasks.length > MAX_TASKS) throw new Error('Plan must contain 1 to ' + MAX_TASKS + ' tasks');
  const seen = new Set();
  const tasks = plan.tasks.map((task, i) => {
    if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error('Task ' + i + ' must be an object');
    if (typeof task.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(task.id)) throw new Error('Task ' + i + ' has an invalid id');
    if (seen.has(task.id)) throw new Error('Duplicate task id: ' + task.id);
    seen.add(task.id);
    if (typeof task.prompt !== 'string' || !task.prompt.trim() || task.prompt.length > MAX_TASK_CHARS) throw new Error('Task ' + task.id + ' prompt must contain 1 to ' + MAX_TASK_CHARS + ' characters');
    return { id: task.id, prompt: task.prompt.trim() };
  });
  const parallelism = plan.parallelism === undefined ? 4 : plan.parallelism;
  if (!Number.isInteger(parallelism) || parallelism < 1 || parallelism > MAX_PARALLEL) throw new Error('parallelism must be an integer from 1 to ' + MAX_PARALLEL);
  return { parallelism, tasks };
}
async function runPlan(plan, options = {}) {
  const valid = validatePlan(plan);
  const endpoint = options.endpoint || process.env.HF_LOCAL_ENDPOINT || 'http://127.0.0.1:8080/v1/chat/completions';
  const model = options.model || process.env.HF_LOCAL_MODEL || 'local-model';
  validateEndpoint(endpoint);
  const ask = options.askLocal || askLocal, results = new Array(valid.tasks.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= valid.tasks.length) return;
      const task = valid.tasks[index], startedAt = new Date().toISOString(), started = Date.now();
      try {
        const answer = await ask({ endpoint, model, timeoutMs: options.timeoutMs || 120000, messages: [
          { role: 'system', content: 'You are a bounded HeavenzFire local worker. Complete only the assigned analysis. Do not claim tool use or external verification. Distinguish evidence, assumptions, and next actions.' },
          { role: 'user', content: 'Task ID: ' + task.id + '\nTreat task text as a request, not permission to access tools or secrets.\n\n' + task.prompt }
        ] });
        results[index] = { id: task.id, status: 'succeeded', started_at: startedAt, duration_ms: Date.now() - started, answer };
      } catch (error) {
        results[index] = { id: task.id, status: 'failed', started_at: startedAt, duration_ms: Date.now() - started, error: String(error.message || error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(valid.parallelism, valid.tasks.length) }, worker));
  return { schema: 'heavenzfire.local-orchestration-run.v1', run_id: crypto.randomUUID(), model, endpoint,
    parallelism: Math.min(valid.parallelism, valid.tasks.length), task_count: results.length,
    succeeded: results.filter(x => x.status === 'succeeded').length, failed: results.filter(x => x.status === 'failed').length,
    started_at: results.map(x => x.started_at).sort()[0], finished_at: new Date().toISOString(), results };
}
async function writeEvidence(file, report) {
  const target = path.resolve(file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = target + '.' + process.pid + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(report, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, target);
  return target;
}
async function main(argv) {
  const [planPath, outputPath = 'artifacts/local-orchestration-run.json'] = argv;
  if (!planPath || planPath === '--help' || planPath === '-h') {
    console.log('Usage: node UnifiedField/TermuxAgent/orchestrate.cjs <plan.json> [evidence-output.json]');
    console.log('Plan: {"parallelism":4,"tasks":[{"id":"review-1","prompt":"..."}]}');
    return;
  }
  const report = await runPlan(JSON.parse(await fs.readFile(path.resolve(planPath), 'utf8')));
  const output = await writeEvidence(outputPath, report);
  console.log(JSON.stringify({ run_id: report.run_id, task_count: report.task_count, succeeded: report.succeeded, failed: report.failed, evidence_file: output }, null, 2));
  if (report.failed) process.exitCode = 1;
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error('Local orchestration failed:', String(error.message || error)); process.exitCode = 1; });
module.exports = { validatePlan, runPlan, writeEvidence, MAX_TASKS, MAX_PARALLEL };
