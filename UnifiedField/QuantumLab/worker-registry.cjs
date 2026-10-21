'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createBlueprint } = require('./worker-forge.cjs');

const ALLOWED_SOURCES = new Set([
  'manual',
  'local_model',
  'local_model_repaired',
  'deterministic_template_fallback'
]);

function createWorkerRegistry(filePath, options = {}) {
  const now = options.now ?? (() => new Date().toISOString());

  function read() {
    if (!fs.existsSync(filePath)) return { schema_version: 1, workers: [] };
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
    if (!parsed || parsed.schema_version !== 1 || !Array.isArray(parsed.workers)) {
      throw new Error('worker_registry_corrupt_or_unsupported');
    }
    return parsed;
  }

  function write(registry) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = filePath + '.tmp-' + process.pid;
    fs.writeFileSync(temporary, JSON.stringify(registry, null, 2), { encoding: 'utf8', flag: 'w' });
    fs.renameSync(temporary, filePath);
  }

  function list() {
    const registry = read();
    return {
      schema_version: registry.schema_version,
      count: registry.workers.length,
      workers: registry.workers
    };
  }

  function register(blueprint, source = 'manual') {
    const built = createBlueprint(blueprint);
    if (!built.ok) return { ok: false, error: 'blueprint_invalid', errors: built.errors };
    const registry = read();
    const existing = registry.workers.find(worker => worker.blueprint_hash === built.blueprint_hash);
    if (existing) return { ok: true, duplicate: true, worker: existing, count: registry.workers.length };
    const timestamp = now();
    const worker = {
      worker_id: built.blueprint.id,
      version: built.blueprint.version,
      role: built.blueprint.role,
      objective: built.blueprint.objective,
      blueprint: built.blueprint,
      blueprint_hash: built.blueprint_hash,
      source: ALLOWED_SOURCES.has(source) ? source : 'manual',
      state: 'candidate',
      created_at: timestamp,
      updated_at: timestamp,
      qualification: { state: 'not_qualified', reason: 'Full matrix and independent review have not passed' },
      last_smoke: null
    };
    registry.workers.push(worker);
    write(registry);
    return { ok: true, duplicate: false, worker, count: registry.workers.length };
  }

  function recordSmoke(blueprintHash, result, artifactFile) {
    if (typeof blueprintHash !== 'string' || !/^[a-f0-9]{64}$/.test(blueprintHash)) {
      return { ok: false, error: 'invalid_blueprint_hash' };
    }
    if (!result || result.mode !== 'adversarial_smoke_only' ||
        !['smoke_pass', 'smoke_failed'].includes(result.state) ||
        result.qualified !== false) {
      return { ok: false, error: 'smoke_result_not_accepted' };
    }
    if (typeof artifactFile !== 'string' || !artifactFile || artifactFile !== path.basename(artifactFile)) {
      return { ok: false, error: 'invalid_artifact_reference' };
    }
    const registry = read();
    const worker = registry.workers.find(item => item.blueprint_hash === blueprintHash);
    if (!worker) return { ok: false, error: 'worker_not_registered' };
    worker.last_smoke = {
      state: result.state,
      qualified: false,
      pass_count: Number(result.pass_count) || 0,
      total_cases: Number(result.total_cases) || 0,
      critical_failures: Number(result.critical_failures) || 0,
      deterministic_cases: Number(result.deterministic_cases) || 0,
      artifact_file: artifactFile,
      completed_at: now()
    };
    worker.updated_at = now();
    // A smoke pass is evidence only; it never changes candidate state or qualification.
    worker.state = 'candidate';
    worker.qualification = { state: 'not_qualified', reason: 'Smoke testing is not full qualification' };
    write(registry);
    return { ok: true, worker };
  }

  return { list, register, recordSmoke };
}

module.exports = { createWorkerRegistry, ALLOWED_SOURCES };
