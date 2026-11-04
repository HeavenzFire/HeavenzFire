'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STATUSES = new Set([
  'planned',
  'partial',
  'implemented_unverified',
  'blocked',
  'verified'
]);

const REQUIRED_STRINGS = ['id', 'name', 'layer', 'owner', 'implementation'];
const REQUIRED_ARRAYS = ['substrates', 'triggers', 'integrations', 'permissions', 'acceptance'];
const VERIFIED_SHA = /^(?:[a-f0-9]{7,40})$/i;

function validateRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    return { ok: false, errors: ['registry_must_be_object'], summary: null };
  }
  if (registry.schemaVersion !== 1) errors.push('unsupported_schema_version');
  if (!Array.isArray(registry.capabilities)) {
    errors.push('capabilities_must_be_array');
  } else if (registry.capabilities.length === 0) {
    errors.push('capabilities_must_not_be_empty');
  }

  const ids = new Set();
  const capabilities = Array.isArray(registry.capabilities) ? registry.capabilities : [];
  for (let i = 0; i < capabilities.length; i += 1) {
    const item = capabilities[i];
    const prefix = 'capabilities[' + i + ']';
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(prefix + ':must_be_object');
      continue;
    }

    for (const key of REQUIRED_STRINGS) {
      if (typeof item[key] !== 'string' || item[key].trim().length === 0) {
        errors.push(prefix + ':invalid_' + key);
      }
    }
    if (typeof item.id === 'string' && /^[a-z0-9][a-z0-9._-]{1,79}$/.test(item.id)) {
      if (ids.has(item.id)) errors.push(prefix + ':duplicate_id:' + item.id);
      else ids.add(item.id);
    } else {
      errors.push(prefix + ':invalid_id');
    }

    if (!STATUSES.has(item.status)) errors.push(prefix + ':invalid_status');
    for (const key of REQUIRED_ARRAYS) {
      if (!Array.isArray(item[key]) || item[key].length === 0 ||
          item[key].some(value => typeof value !== 'string' || value.trim().length === 0)) {
        errors.push(prefix + ':' + key + '_must_be_nonempty_string_array');
      }
    }

    if (!item.evidence || typeof item.evidence !== 'object' || Array.isArray(item.evidence)) {
      errors.push(prefix + ':evidence_must_be_object');
    } else if (item.status === 'verified') {
      const evidence = item.evidence;
      if (typeof evidence.testCommand !== 'string' || !evidence.testCommand.trim() ||
          evidence.testResult !== 'pass' ||
          typeof evidence.revision !== 'string' || !VERIFIED_SHA.test(evidence.revision) ||
          typeof evidence.verifiedAt !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(evidence.verifiedAt) ||
          !Number.isFinite(Date.parse(evidence.verifiedAt))) {
        errors.push(prefix + ':verified_requires_reproducible_passing_evidence');
      }
    }
  }

  const counts = Object.fromEntries(Array.from(STATUSES, status => [status, 0]));
  for (const item of capabilities) {
    if (item && STATUSES.has(item.status)) counts[item.status] += 1;
  }
  const summary = {
    total: capabilities.length,
    counts,
    incomplete: capabilities.filter(item => item && item.status !== 'verified').length,
    verified: counts.verified
  };
  return { ok: errors.length === 0, errors, summary };
}

function readRegistry(filePath) {
  const absolute = path.resolve(filePath);
  const raw = fs.readFileSync(absolute, 'utf8');
  return { absolute, registry: JSON.parse(raw) };
}

function run(argv = process.argv.slice(2), io = console) {
  const filePath = argv.find(arg => !arg.startsWith('--')) ||
    path.join(__dirname, 'unified-field-completeness.json');
  const strict = argv.includes('--strict');
  let loaded;
  try {
    loaded = readRegistry(filePath);
  } catch (error) {
    io.error(JSON.stringify({ ok: false, error: 'registry_read_failed', message: error.message }));
    return 2;
  }
  const result = validateRegistry(loaded.registry);
  io.log(JSON.stringify({
    file: loaded.absolute,
    ok: result.ok,
    summary: result.summary,
    errors: result.errors
  }, null, 2));
  if (!result.ok) return 1;
  if (strict && result.summary.incomplete > 0) return 3;
  return 0;
}

if (require.main === module) process.exitCode = run();

module.exports = { STATUSES, validateRegistry, readRegistry, run };
