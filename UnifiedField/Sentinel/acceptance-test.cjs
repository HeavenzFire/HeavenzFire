'use strict';

// Sentinel acceptance runner. Offline by default: no target traffic is generated.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = __dirname;
const manifestPath = path.join(root, 'sentinel-agent-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];

function check(condition, label) {
  if (condition) process.stdout.write('PASS  ' + label + '\n');
  else {
    process.stderr.write('FAIL  ' + label + '\n');
    failures.push(label);
  }
}

check(manifest.name === 'HeavenzFire Sentinel', 'Sentinel manifest identity');
check(Array.isArray(manifest.agents) && manifest.agents.length === 16, '16 specialist roles declared');
check(new Set(manifest.agents.map(agent => agent.id)).size === 16, '16 unique agent role identifiers');
check(Number.isInteger(manifest.maxParallel) && manifest.maxParallel >= 1 && manifest.maxParallel <= 16, 'bounded maxParallel configuration');
check(manifest.safety && manifest.safety.approval === 'trusted human approval required before network activity', 'human approval requirement declared');
check(Array.isArray(manifest.safety.prohibited) && manifest.safety.prohibited.includes('exploit_execution'), 'prohibited offensive execution declared');

const policyPath = path.join(root, 'scope-policy.cjs');
const adapterPath = path.join(root, 'passive-assessment.cjs');
const ledgerPath = path.resolve(root, '..', 'FieldCore', 'evidence-ledger.cjs');
check(fs.existsSync(policyPath), 'scope policy module exists');
check(fs.existsSync(adapterPath), 'passive assessment adapter exists');
check(fs.existsSync(ledgerPath), 'evidence ledger implementation exists');

try {
  const policy = require(policyPath);
  const adapter = require(adapterPath);
  const ledger = require(ledgerPath);
  check(typeof policy.validateScanRequest === 'function', 'scope authorization API exported');
  check(typeof policy.createScopeDigest === 'function', 'scope digest API exported');
  check(typeof adapter.runAssessment === 'function', 'passive assessment API exported');
  check(typeof adapter.isPublicAddress === 'function', 'public-address guard exported');
  check(typeof ledger.appendEvidence === 'function' && typeof ledger.verifyLedger === 'function', 'evidence append and verification APIs exported');
  check(adapter.isPublicAddress('127.0.0.1') === false, 'loopback destination rejected');
  check(adapter.isPublicAddress('10.0.0.1') === false, 'private IPv4 destination rejected');
  check(adapter.isPublicAddress('93.184.216.34') === true, 'public IPv4 control case accepted');
} catch (error) {
  process.stderr.write('FAIL  module load / export checks: ' + error.message + '\n');
  failures.push('module load / export checks');
}

process.stdout.write('\nRunning deterministic policy and adapter tests (no live target traffic)...\n');
const testFiles = ['scope-policy.test.cjs', 'passive-assessment.test.cjs'];
const testRun = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: root,
  encoding: 'utf8',
  timeout: 120000,
  maxBuffer: 4 * 1024 * 1024
});
if (testRun.stdout) process.stdout.write(testRun.stdout);
if (testRun.stderr) process.stderr.write(testRun.stderr);
check(testRun.status === 0, 'Node test suites exit successfully');

process.stdout.write('\n');
if (failures.length) {
  process.stderr.write('SENTINEL ACCEPTANCE: FAIL (' + failures.length + ' failed gate(s))\n');
  process.exitCode = 1;
} else {
  process.stdout.write('SENTINEL ACCEPTANCE: PASS\n');
  process.stdout.write('Mode: offline deterministic checks; no network assessment performed.\n');
}
