'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const { createRestartPolicy } = require('./unified-restart-policy.cjs');

const HOST = '127.0.0.1';
const PORT = Number(process.env.HF_UNIFIED_PORT || 11812);
const HEALTH_INTERVAL_MS = Math.max(1000, Math.min(Number(process.env.HF_SUPERVISOR_HEALTH_INTERVAL_MS) || 5000, 30000));
const HEALTH_FAILURE_LIMIT = 3;
const SERVER_PATH = path.join(__dirname, 'HeavenzFire-Unified-Intelligence-Server.cjs');
const policy = createRestartPolicy({ maxRestarts: 5, windowMs: 10 * 60 * 1000, baseDelayMs: 1000, maxDelayMs: 30000 });
let child = null;
let stopping = false;

function log(event, details = {}) {
  process.stdout.write(JSON.stringify({ at: new Date().toISOString(), component: 'unified-supervisor', event, ...details }) + '\n');
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function probeHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch('http://' + HOST + ':' + PORT + '/api/health', {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const body = await response.json();
    return body && body.service === 'HeavenzFire Unified Intelligence';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForChildOrHealthFailure(processHandle) {
  let failures = 0;
  while (!stopping) {
    await delay(HEALTH_INTERVAL_MS);
    if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
      return { reason: 'process-exit', code: processHandle.exitCode, signal: processHandle.signalCode };
    }
    if (await probeHealth()) {
      if (failures) log('health-recovered', { consecutiveFailures: failures });
      failures = 0;
      continue;
    }
    failures++;
    log('health-probe-failed', { consecutiveFailures: failures, limit: HEALTH_FAILURE_LIMIT });
    if (failures >= HEALTH_FAILURE_LIMIT) {
      log('terminating-unhealthy-child', { pid: processHandle.pid });
      processHandle.kill();
      const deadline = Date.now() + 3000;
      while (processHandle.exitCode === null && processHandle.signalCode === null && Date.now() < deadline) await delay(100);
      if (processHandle.exitCode === null && processHandle.signalCode === null) {
        log('child-did-not-stop-gracefully', { pid: processHandle.pid });
        processHandle.kill('SIGKILL');
      }
      return { reason: 'health-failure', code: processHandle.exitCode, signal: processHandle.signalCode };
    }
  }
  return { reason: 'supervisor-shutdown', code: 0 };
}

async function main() {
  if (await probeHealth()) {
    throw new Error('Unified Intelligence is already running on port ' + PORT + '; refusing to create a competing instance.');
  }
  log('supervisor-started', { host: HOST, port: PORT, healthIntervalMs: HEALTH_INTERVAL_MS, restartLimit: 5, restartWindowMs: 600000 });
  while (!stopping) {
    child = spawn(process.execPath, [SERVER_PATH], { env: process.env, stdio: 'inherit' });
    log('child-started', { pid: child.pid, port: PORT });
    const outcome = await waitForChildOrHealthFailure(child);
    child = null;
    if (stopping || outcome.reason === 'supervisor-shutdown') break;
    const budget = policy.recordRestart(Date.now());
    log('child-restart-requested', { ...outcome, budget });
    if (!budget.allowed) {
      log('restart-budget-exhausted', { action: 'fail-closed', message: 'Inspect logs and repair the root cause before restarting manually.' });
      process.exitCode = 1;
      break;
    }
    await delay(budget.delayMs);
  }
  log('supervisor-stopped');
}

function stop(signal) {
  if (stopping) return;
  stopping = true;
  log('shutdown-requested', { signal });
  if (child && child.exitCode === null && child.signalCode === null) child.kill();
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

if (require.main === module) {
  main().catch(error => {
    log('fatal', { message: error.message });
    process.exitCode = 1;
  });
}

module.exports = { probeHealth, waitForChildOrHealthFailure };
