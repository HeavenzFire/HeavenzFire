'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planResilientRoutes } = require('./uf-resilient-routing.cjs');
const nodes = ['s','a','b','t'].map(id => ({ id }));
const links = [
 { id:'sa',from:'s',to:'a' }, { id:'at',from:'a',to:'t' },
 { id:'sb',from:'s',to:'b' }, { id:'bt',from:'b',to:'t' }
];
const plan = (extra={}) => planResilientRoutes({ nodes, links, source:'s', target:'t', ...extra });

test('finds deterministic node- and link-disjoint routes', () => {
 const r=plan(); assert.equal(r.status,'RESILIENT'); assert.equal(r.routes.length,2);
 assert.deepEqual(r.routes[0].nodes,['s','a','t']); assert.deepEqual(r.routes[1].nodes,['s','b','t']);
 assert.equal(r.guarantees.automaticFailover,false); assert.equal(r.guarantees.taskExecution,false);
});
test('avoids failed links and recomputes from the supplied snapshot', () => {
 const r=plan({failedLinks:['sa']}); assert.equal(r.status,'DEGRADED');
 assert.deepEqual(r.routes[0].nodes,['s','b','t']);
});
test('avoids failed intermediate nodes', () => {
 const r=plan({failedNodes:['a']}); assert.equal(r.status,'DEGRADED');
 assert.deepEqual(r.routes[0].nodes,['s','b','t']);
});
test('holds when no route survives a partition', () => {
 const r=plan({failedLinks:['sa','at','sb','bt']});
 assert.equal(r.status,'HOLD'); assert.equal(r.reason,'NO_ROUTE'); assert.deepEqual(r.routes,[]);
});
test('holds when endpoints are unavailable or unknown', () => {
 assert.equal(plan({failedNodes:['s']}).reason,'ENDPOINT_UNAVAILABLE');
 assert.equal(plan({target:'missing'}).reason,'UNKNOWN_ENDPOINT');
});
test('a single corridor is degraded, never called resilient', () => {
 const r=plan({links:[{id:'sa',from:'s',to:'a'},{id:'at',from:'a',to:'t'}]});
 assert.equal(r.status,'DEGRADED'); assert.equal(r.routes.length,1);
});
test('is deterministic under input reordering', () => {
 const a=plan(), b=plan({nodes:[...nodes].reverse(),links:[...links].reverse()});
 assert.deepEqual(a.routes,b.routes); assert.equal(a.status,b.status);
});
test('rejects duplicate nodes, duplicate links, invalid edges, and invalid failure IDs', () => {
 assert.throws(()=>plan({nodes:[...nodes,nodes[0]]}),/duplicate node id/);
 assert.throws(()=>plan({links:[...links,links[0]]}),/duplicate link id/);
 assert.throws(()=>plan({links:[{id:'bad',from:'s',to:'missing'}]}),/unknown node/);
 assert.throws(()=>plan({failedLinks:['nope']}),/known link IDs/);
});
test('explicitly disclaims live health and shared-risk guarantees', () => {
 const r=plan(); assert.equal(r.guarantees.liveHealthVerified,false);
 assert.equal(r.guarantees.sharedRiskDomainsVerified,false);
});
