'use strict';

// Deterministic topology planner only. It does not connect, replicate, or execute nodes.
// Node membership and topology output are proposals that require explicit deployment.
function validateNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) throw new TypeError('nodes must be a non-empty array');
  const seen = new Set();
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || !n.id.trim()) throw new TypeError('each node needs a non-empty id');
    if (seen.has(n.id)) throw new TypeError('duplicate node id: ' + n.id);
    seen.add(n.id);
    if (typeof n.cluster !== 'string' || !n.cluster.trim()) throw new TypeError('each node needs a cluster');
    if (!['local', 'gateway', 'observer'].includes(n.role)) throw new TypeError('unsupported role for ' + n.id);
  }
}
function planTopology(nodes, options = {}) {
  validateNodes(nodes);
  const replicationFactor = options.replicationFactor ?? 2;
  if (!Number.isInteger(replicationFactor) || replicationFactor < 1 || replicationFactor > 5) {
    throw new RangeError('replicationFactor must be an integer from 1 to 5');
  }
  const sorted = nodes.map(n => ({ ...n })).sort((a,b) => a.id.localeCompare(b.id));
  const clusters = new Map();
  for (const n of sorted) {
    if (!clusters.has(n.cluster)) clusters.set(n.cluster, []);
    clusters.get(n.cluster).push(n);
  }
  const edges = [];
  const add = (from, to, kind) => {
    if (from !== to && !edges.some(e => e.from === from && e.to === to && e.kind === kind)) edges.push({ from, to, kind });
  };
  for (const members of clusters.values()) {
    const gateways = members.filter(n => n.role === 'gateway');
    const anchor = gateways[0] || members[0];
    // Ring edges give each cluster a deterministic local fallback path.
    if (members.length > 1) {
      for (let i = 0; i < members.length; i++) add(members[i].id, members[(i + 1) % members.length].id, 'intra-cluster');
    }
    for (const n of members) if (n.id !== anchor.id) add(n.id, anchor.id, 'cluster-anchor');
  }
  const clusterNames = [...clusters.keys()].sort();
  const anchors = clusterNames.map(name => {
    const members = clusters.get(name);
    return members.find(n => n.role === 'gateway') || members[0];
  });
  // Inter-cluster overlay: bounded deterministic neighbors, not a full mesh.
  for (let i = 0; i < anchors.length; i++) {
    for (let offset = 1; offset <= Math.min(replicationFactor, anchors.length - 1); offset++) {
      add(anchors[i].id, anchors[(i + offset) % anchors.length].id, 'inter-cluster');
    }
  }
  const degree = Object.fromEntries(sorted.map(n => [n.id, 0]));
  for (const e of edges) degree[e.from]++;
  return {
    schema: 'heavenzfire.topology-plan.v1',
    mode: 'PLAN_ONLY',
    replicationFactor,
    nodeCount: sorted.length,
    clusterCount: clusters.size,
    nodes: sorted.map(n => ({ id: n.id, cluster: n.cluster, role: n.role })),
    edges,
    outDegree: degree,
    guarantees: {
      deterministicOrdering: true,
      noNetworkOperations: true,
      noAutomaticReplication: true,
      requiresDeploymentApproval: true
    },
    limitations: [
      'A planned edge is not a verified live connection.',
      'Topology alone does not replicate data or prove consistency.',
      'Replication factor is an overlay-neighbor bound, not a data-copy count.',
      'Failure tolerance depends on independent failure domains and tested recovery.'
    ]
  };
}
module.exports = { planTopology, validateNodes };
