'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createTeamStore } = require('./team-ledger.cjs');

const inputPath = path.resolve(process.argv[2] || path.join(__dirname, 'state', 'provider-probe-latest.json'));
const raw = fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '');
const report = JSON.parse(raw);
if (report.schema !== 'heavenzfire.team.provider-probe.v1' || !Array.isArray(report.results)) {
  throw new Error('provider_probe_report_invalid');
}

function canonicalStatus(observed) {
  if (observed === 'verified') return 'verified';
  if (observed === 'unavailable' || observed === 'cli_missing') return 'unavailable';
  if (observed === 'installation_incomplete') return 'blocked';
  if (observed === 'auth_required') return 'auth_required';
  return 'unknown';
}

const store = createTeamStore({ rootDir: __dirname });
const recorded = [];
for (const result of report.results) {
  const status = canonicalStatus(result.observed_status);
  const evidence = String(result.evidence || result.observed_status || 'No evidence supplied');
  const outcome = store.recordProviderProbe(result.provider_id, status, evidence);
  recorded.push({ provider_id: result.provider_id, status, recorded: outcome.ok === true, error: outcome.error || null });
}
process.stdout.write(JSON.stringify({
  schema: 'heavenzfire.team.provider-probe-record.v1',
  source_report: path.basename(inputPath),
  recorded_at: new Date().toISOString(),
  count: recorded.length,
  results: recorded,
  ledger: store.ledgerPath
}, null, 2) + '\n');
if (recorded.some((item) => !item.recorded)) process.exitCode = 1;