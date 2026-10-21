'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cli = path.join(__dirname, 'uf-topology-cli.cjs');
function fixture(value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf-topology-cli-'));
  const file = path.join(dir, 'nodes.json');
  fs.writeFileSync(file, JSON.stringify(value), 'utf8');
  return { dir, file, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
test('CLI emits deterministic plan-only JSON from a node manifest', () => {
  const f = fixture({ nodes: [
    { id: 'local-a', cluster: 'laptop', role: 'gateway' },
    { id: 'local-b', cluster: 'laptop', role: 'local' },
    { id: 'remote-c', cluster: 'lab', role: 'gateway' }
  ] });
  try {
    const r = spawnSync(process.execPath, [cli, '--input', f.file], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const plan = JSON.parse(r.stdout);
    assert.equal(plan.mode, 'PLAN_ONLY');
    assert.equal(plan.nodeCount, 3);
    assert.equal(plan.guarantees.noNetworkOperations, true);
  } finally { f.cleanup(); }
});
test('CLI rejects malformed manifest and unsafe replication factor', () => {
  const malformed = fixture({ nodes: 'not-an-array' });
  const valid = fixture({ nodes: [{ id: 'one', cluster: 'local', role: 'gateway' }] });
  try {
    const badManifest = spawnSync(process.execPath, [cli, '--input', malformed.file], { encoding: 'utf8' });
    assert.equal(badManifest.status, 2);
    assert.match(badManifest.stderr, /nodes array/);
    const badFactor = spawnSync(process.execPath, [cli, '--input', valid.file, '--replication-factor', '99'], { encoding: 'utf8' });
    assert.equal(badFactor.status, 2);
    assert.match(badFactor.stderr, /replicationFactor/);
  } finally { malformed.cleanup(); valid.cleanup(); }
});
test('CLI help does not require a manifest', () => {
  const r = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /PLAN_ONLY/);
});
