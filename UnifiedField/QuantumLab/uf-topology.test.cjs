'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planTopology } = require('./uf-topology.cjs');

const nodes = [
  { id: 'a1', cluster: 'alpha', role: 'gateway' },
  { id: 'a2', cluster: 'alpha', role: 'local' },
  { id: 'b1', cluster: 'beta', role: 'gateway' },
  { id: 'b2', cluster: 'beta', role: 'observer' },
  { id: 'c1', cluster: 'gamma', role: 'local' }
];

test('topology plan is deterministic regardless of input order', () => {
  assert.deepEqual(planTopology(nodes), planTopology([...nodes].reverse()));
});
test('planner declares plan-only and does not claim live connectivity', () => {
  const p = planTopology(nodes);
  assert.equal(p.mode, 'PLAN_ONLY');
  assert.equal(p.guarantees.noNetworkOperations, true);
  assert.equal(p.guarantees.noAutomaticReplication, true);
  assert.ok(p.limitations.some(s => s.includes('not a verified live connection')));
});
test('each cluster gets a local ring when it has multiple members', () => {
  const p = planTopology(nodes);
  assert.ok(p.edges.some(e => e.kind === 'intra-cluster' && e.from === 'a1' && e.to === 'a2'));
  assert.ok(p.edges.some(e => e.kind === 'intra-cluster' && e.from === 'a2' && e.to === 'a1'));
});
test('inter-cluster links are bounded by replication factor', () => {
  const p = planTopology(nodes, { replicationFactor: 1 });
  const inter = p.edges.filter(e => e.kind === 'inter-cluster');
  for (const n of p.nodes) {
    assert.ok(inter.filter(e => e.from === n.id).length <= 1);
  }
});
test('rejects duplicate IDs and unsafe fanout values', () => {
  assert.throws(() => planTopology([nodes[0], nodes[0]]), /duplicate node id/);
  assert.throws(() => planTopology(nodes, { replicationFactor: 0 }), /replicationFactor/);
});
test('every edge references a known node and avoids self loops', () => {
  const p = planTopology(nodes);
  const ids = new Set(p.nodes.map(n => n.id));
  for (const e of p.edges) {
    assert.ok(ids.has(e.from) && ids.has(e.to));
    assert.notEqual(e.from, e.to);
  }
});
