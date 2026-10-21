'use strict';

// Deterministic, bounded route planner. No sockets, retries, dispatch, or task execution.
// Links are directed. A plan is evidence about the supplied graph snapshot only.
const MAX_NODES = 32;
const MAX_LINKS = 128;
const MAX_SEARCH_STATES = 20000;

function nonEmptyId(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(field + ' must be a non-empty string');
  return value;
}

function validateGraph(nodes, links) {
  if (!Array.isArray(nodes) || nodes.length < 2 || nodes.length > MAX_NODES) {
    throw new RangeError('nodes must contain 2 to ' + MAX_NODES + ' entries');
  }
  if (!Array.isArray(links) || links.length > MAX_LINKS) {
    throw new RangeError('links must contain at most ' + MAX_LINKS + ' entries');
  }
  const nodeIds = new Set();
  for (const node of nodes) {
    if (!node || typeof node !== 'object') throw new TypeError('each node must be an object');
    const id = nonEmptyId(node.id, 'node.id');
    if (nodeIds.has(id)) throw new TypeError('duplicate node id: ' + id);
    nodeIds.add(id);
    if (node.available !== undefined && typeof node.available !== 'boolean') {
      throw new TypeError('node.available must be boolean when supplied');
    }
  }
  const linkIds = new Set();
  for (const link of links) {
    if (!link || typeof link !== 'object') throw new TypeError('each link must be an object');
    const id = nonEmptyId(link.id, 'link.id');
    const from = nonEmptyId(link.from, 'link.from');
    const to = nonEmptyId(link.to, 'link.to');
    if (linkIds.has(id)) throw new TypeError('duplicate link id: ' + id);
    linkIds.add(id);
    if (from === to) throw new TypeError('self-links are not permitted: ' + id);
    if (!nodeIds.has(from) || !nodeIds.has(to)) throw new TypeError('link references unknown node: ' + id);
    if (link.available !== undefined && typeof link.available !== 'boolean') {
      throw new TypeError('link.available must be boolean when supplied');
    }
  }
  return { nodeIds, linkIds };
}

function planResilientRoutes(input) {
  if (!input || typeof input !== 'object') throw new TypeError('input must be an object');
  const { nodes, links, source, target } = input;
  const { nodeIds, linkIds } = validateGraph(nodes, links);
  nonEmptyId(source, 'source');
  nonEmptyId(target, 'target');
  if (!nodeIds.has(source) || !nodeIds.has(target)) return { status: 'HOLD', reason: 'UNKNOWN_ENDPOINT', routes: [] };
  if (source === target) return { status: 'HOLD', reason: 'SOURCE_EQUALS_TARGET', routes: [] };

  const failedNodes = input.failedNodes ?? [];
  const failedLinks = input.failedLinks ?? [];
  if (!Array.isArray(failedNodes) || failedNodes.some(id => typeof id !== 'string' || !nodeIds.has(id))) {
    throw new TypeError('failedNodes must contain known node IDs');
  }
  if (!Array.isArray(failedLinks) || failedLinks.some(id => typeof id !== 'string' || !linkIds.has(id))) {
    throw new TypeError('failedLinks must contain known link IDs');
  }
  if (new Set(failedNodes).size !== failedNodes.length || new Set(failedLinks).size !== failedLinks.length) {
    throw new TypeError('failure lists must not contain duplicates');
  }

  const failedNodeSet = new Set(failedNodes);
  const failedLinkSet = new Set(failedLinks);
  const availableNodes = new Map(nodes.map(n => [n.id, n]));
  if (failedNodeSet.has(source) || failedNodeSet.has(target) ||
      availableNodes.get(source).available === false || availableNodes.get(target).available === false) {
    return { status: 'HOLD', reason: 'ENDPOINT_UNAVAILABLE', routes: [] };
  }

  const adjacency = new Map(nodes.map(n => [n.id, []]));
  for (const link of links) {
    if (failedLinkSet.has(link.id) || link.available === false ||
        failedNodeSet.has(link.from) || failedNodeSet.has(link.to) ||
        availableNodes.get(link.from).available === false || availableNodes.get(link.to).available === false) continue;
    adjacency.get(link.from).push({ id: link.id, to: link.to });
  }
  for (const list of adjacency.values()) list.sort((a, b) => a.to.localeCompare(b.to) || a.id.localeCompare(b.id));

  const paths = [];
  let states = 0;
  let searchLimitHit = false;
  function walk(node, pathNodes, pathLinks, visited) {
    if (searchLimitHit) return;
    states++;
    if (states > MAX_SEARCH_STATES) { searchLimitHit = true; return; }
    if (node === target) {
      paths.push({ nodes: pathNodes.slice(), links: pathLinks.slice() });
      return;
    }
    for (const edge of adjacency.get(node)) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      pathNodes.push(edge.to);
      pathLinks.push(edge.id);
      walk(edge.to, pathNodes, pathLinks, visited);
      pathLinks.pop();
      pathNodes.pop();
      visited.delete(edge.to);
      if (searchLimitHit) return;
    }
  }
  walk(source, [source], [], new Set([source]));
  if (searchLimitHit) return { status: 'HOLD', reason: 'SEARCH_LIMIT', routes: [], searchStates: states };
  paths.sort((a, b) => a.links.length - b.links.length ||
    a.nodes.join('\u0000').localeCompare(b.nodes.join('\u0000')) ||
    a.links.join('\u0000').localeCompare(b.links.join('\u0000')));

  if (paths.length === 0) return { status: 'HOLD', reason: 'NO_ROUTE', routes: [], searchStates: states };
  const primary = paths[0];
  const internal = path => new Set(path.nodes.slice(1, -1));
  const edgeSet = path => new Set(path.links);
  let backup = null;
  for (const candidate of paths.slice(1)) {
    const a = internal(primary), b = internal(candidate);
    if ([...a].some(id => b.has(id))) continue;
    const ae = edgeSet(primary), be = edgeSet(candidate);
    if ([...ae].some(id => be.has(id))) continue;
    backup = candidate;
    break;
  }
  const routes = [{ role: 'PRIMARY', nodes: primary.nodes, links: primary.links }];
  if (backup) routes.push({ role: 'BACKUP', nodes: backup.nodes, links: backup.links });
  return {
    status: backup ? 'RESILIENT' : 'DEGRADED',
    reason: backup ? 'TWO_NODE_AND_LINK_DISJOINT_ROUTES' : 'SINGLE_ROUTE_ONLY',
    routes,
    guarantees: {
      deterministicForSameSnapshot: true,
      nodeDisjointExceptEndpoints: Boolean(backup),
      linkDisjoint: Boolean(backup),
      automaticFailover: false,
      taskExecution: false,
      liveHealthVerified: false,
      sharedRiskDomainsVerified: false
    },
    searchStates: states
  };
}

module.exports = { MAX_NODES, MAX_LINKS, MAX_SEARCH_STATES, validateGraph, planResilientRoutes };
