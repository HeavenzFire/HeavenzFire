'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const SERVICES = Object.freeze([
  { id: 'browserbridge', name: '144A BrowserBridge', url: 'http://127.0.0.1:18795/health', required: true },
  { id: 'ollama', name: 'Ollama local model runtime', url: 'http://127.0.0.1:11434/api/tags', required: true },
  { id: 'gateway', name: 'HeavenzFire gateway', url: 'http://127.0.0.1:8787/health', required: false },
  { id: 'orchestrator', name: 'HeavenzFire orchestrator', url: 'http://127.0.0.1:8788/health', required: false },
  { id: 'agent', name: 'HeavenzFire agent service', url: 'http://127.0.0.1:8790/health', required: false }
]);

function hostSnapshot() {
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  let disk = { state: 'unknown', reason: 'Filesystem statistics unavailable' };
  try {
    const stat = fs.statfsSync(process.env.SystemDrive ? process.env.SystemDrive + path.sep : 'C:' + path.sep);
    const freeBytes = stat.bavail * stat.bsize;
    const totalBytes = stat.blocks * stat.bsize;
    const freeGB = Number((freeBytes / (1024 ** 3)).toFixed(2));
    disk = { state: freeGB < 8 ? 'critical' : freeGB < 15 ? 'warning' : 'healthy', drive: process.env.SystemDrive || 'C:', freeBytes, totalBytes, freeGB, totalGB: Number((totalBytes / (1024 ** 3)).toFixed(2)), thresholdsGB: { warning: 15, critical: 8 } };
  } catch (error) {
    disk = { state: 'unknown', reason: String(error.message || error).slice(0, 160) };
  }
  const memoryPercentFree = totalMemoryBytes ? Number((freeMemoryBytes / totalMemoryBytes * 100).toFixed(1)) : 0;
  return {
    computer: os.hostname(), platform: os.platform(), uptimeSeconds: Math.floor(os.uptime()),
    memory: { state: memoryPercentFree < 5 ? 'critical' : memoryPercentFree < 10 ? 'warning' : 'healthy', totalBytes: totalMemoryBytes, freeBytes: freeMemoryBytes, freeGB: Number((freeMemoryBytes / (1024 ** 3)).toFixed(2)), freePercent: memoryPercentFree, thresholdsFreePercent: { warning: 10, critical: 5 } },
    disk
  };
}

function createGuardianWatch({ statePath, onEvent = () => {}, intervalMs = 30000 } = {}) {
  if (!statePath) throw new TypeError('statePath is required');
  let timer = null;
  let checking = false;
  let previous = new Map();
  let state = {
    schema: 'heavenzfire.guardian-state.v1',
    mode: 'read-only-observation',
    remediation: 'disabled-until-separately-tested-and-approved',
    startedAt: new Date().toISOString(),
    checkedAt: null,
    overall: 'initializing',
    services: SERVICES.map(s => ({ id: s.id, name: s.name, state: 'pending', url: s.url })),
    findings: ['No automatic changes, process termination, file deletion, firewall edits, or command execution are permitted by this watcher.']
  };

  async function checkOne(service) {
    const started = Date.now();
    try {
      const response = await fetch(service.url, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
      let detail = null;
      if (service.id === 'browserbridge') {
        const data = await response.json().catch(() => ({}));
        detail = { fieldExecution: data.fieldExecution === true, taskCount: Number(data.taskCount) || 0 };
      } else if (service.id === 'ollama') {
        const data = await response.json().catch(() => ({}));
        detail = { modelCount: Array.isArray(data.models) ? data.models.length : 0 };
      } else {
        detail = { statusCode: response.status };
      }
      return { id: service.id, name: service.name, url: service.url, required: service.required === true, state: response.ok ? 'healthy' : 'degraded', statusCode: response.status, latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), detail };
    } catch (error) {
      return { id: service.id, name: service.name, url: service.url, state: 'unreachable', latencyMs: Date.now() - started, checkedAt: new Date().toISOString(), error: String(error.message || error).slice(0, 180) };
    }
  }

  async function checkNow() {
    if (checking) return state;
    checking = true;
    try {
      const services = await Promise.all(SERVICES.map(checkOne));
      const host = hostSnapshot();
      const requiredFailures = services.filter(s => s.required && s.state !== 'healthy');
      const optionalFailures = services.filter(s => !s.required && s.state !== 'healthy');
      const diskCritical = host.disk.state === 'critical';
      const diskWarning = host.disk.state === 'warning';
      const memoryCritical = host.memory.state === 'critical';
      const memoryWarning = host.memory.state === 'warning';
      const overall = requiredFailures.length || diskCritical || memoryCritical ? 'critical' : (optionalFailures.length || diskWarning || memoryWarning || host.disk.state === 'unknown') ? 'degraded' : 'healthy';
      const findings = [];
      for (const service of requiredFailures) findings.push('REQUIRED: ' + service.name + ': ' + service.state + (service.error ? ' (' + service.error + ')' : ''));
      for (const service of optionalFailures) findings.push('OPTIONAL: ' + service.name + ': ' + service.state + (service.error ? ' (' + service.error + ')' : ''));
      if (diskCritical || diskWarning || host.disk.state === 'unknown') findings.push('DISK: ' + host.disk.state + (host.disk.freeGB !== undefined ? ' (' + host.disk.freeGB + ' GB free)' : ' (' + host.disk.reason + ')'));
      if (memoryCritical || memoryWarning) findings.push('MEMORY: ' + host.memory.state + ' (' + host.memory.freeGB + ' GB free; ' + host.memory.freePercent + '% available)');
      const next = { ...state, checkedAt: new Date().toISOString(), overall, host, services, findings, policy: { requiredServices: ['browserbridge', 'ollama'], optionalServices: ['gateway', 'orchestrator', 'agent'], diskWarningFreeGB: 15, diskCriticalFreeGB: 8, memoryWarningFreePercent: 10, memoryCriticalFreePercent: 5, automaticRemediation: false } };
      if (!next.findings.length) next.findings = ['Required loopback services and host disk checks passed. Optional legacy endpoints are reported separately. No remediation actions were taken.'];
      for (const service of services) {
        const old = previous.get(service.id);
        if (old !== service.state) { try { onEvent({ event: 'GuardianServiceStateChanged', service: service.id, previous: old || 'unknown', current: service.state, checkedAt: service.checkedAt }); } catch {} }
      }
      previous = new Map(services.map(s => [s.id, s.state]));
      state = next;
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
      return state;
    } finally {
      checking = false;
    }
  }

  function start() {
    if (timer) return;
    void checkNow().catch(error => onEvent({ event: 'GuardianCheckFailed', error: String(error.message || error).slice(0, 180) }));
    timer = setInterval(() => { void checkNow().catch(error => onEvent({ event: 'GuardianCheckFailed', error: String(error.message || error).slice(0, 180) })); }, intervalMs);
    if (timer.unref) timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, checkNow, getState: () => JSON.parse(JSON.stringify(state)) };
}

module.exports = { createGuardianWatch, SERVICES };
