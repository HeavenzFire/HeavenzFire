'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MycelialFabric } = require('./mycelial-fabric.cjs');

function seeded(options = {}) {
  const fabric = new MycelialFabric(options);
  fabric.registerNode({
    id: 'angelus',
    kind: 'coordinator',
    capabilities: ['publish:*'],
    subscriptions: ['*']
  });
  fabric.registerNode({
    id: 'reasoner',
    capabilities: ['publish:*'],
    subscriptions: ['analysis', 'critique']
  });
  fabric.registerNode({
    id: 'coder',
    capabilities: ['publish:code'],
    subscriptions: ['code', 'analysis']
  });
  fabric.registerNode({
    id: 'verifier',
    capabilities: ['publish:analysis'],
    subscriptions: ['analysis']
  });
  fabric.connect({ from: 'angelus', to: 'reasoner', cost: 1 });
  fabric.connect({ from: 'reasoner', to: 'coder', cost: 1, topics: ['code', 'analysis'] });
  fabric.connect({ from: 'coder', to: 'verifier', cost: 1, topics: ['analysis'] });
  fabric.connect({ from: 'angelus', to: 'verifier', cost: 8, topics: ['maintenance'] });
  return fabric;
}

test('routes over the lowest-cost eligible path and exposes topology', () => {
  const fabric = seeded();
  assert.deepEqual(fabric.route('angelus', 'verifier', 'analysis'), {
    path: ['angelus', 'reasoner', 'coder', 'verifier'],
    hops: 3,
    cost: 3
  });
  assert.equal(fabric.topology().nodeCount, 4);
  assert.equal(fabric.topology().linkCount, 4);
});

test('rejects unknown nodes, malformed topics and unauthorized publishers', () => {
  const fabric = seeded();
  assert.throws(() => fabric.connect({ from: 'missing', to: 'coder' }), /registered/);
  assert.throws(() => fabric.route('angelus', 'coder', 'Bad Topic'), /Topic/);
  assert.throws(() => fabric.createEnvelope({
    from: 'coder',
    to: 'reasoner',
    topic: 'analysis',
    payload: {}
  }), /authorized/);
});

test('delivers only to the addressed subscribed active recipient', async () => {
  const fabric = seeded();
  const received = [];
  const result = await fabric.send({
    from: 'angelus',
    to: 'coder',
    topic: 'code',
    payload: { request: 'review' }
  }, {
    deliver: async item => received.push(item)
  });

  assert.equal(result.status, 'delivered');
  assert.deepEqual(result.route.path, ['angelus', 'reasoner', 'coder']);
  assert.equal(received.length, 1);
  assert.equal(received[0].recipient.id, 'coder');

  fabric.setNodeState('reasoner', 'offline');
  assert.equal(fabric.route('angelus', 'coder', 'code'), null);
});

test('rejects caller-forged direct envelopes before delivery', async () => {
  const fabric = seeded();
  const forged = {
    schema: 'heavenzfire.agqi.message.v1',
    messageId: 'forged',
    from: 'coder',
    to: 'reasoner',
    topic: 'analysis',
    expiresAt: Date.now() + 10000,
    hopLimit: 8,
    payload: {}
  };

  await assert.rejects(
    fabric.send(forged, { deliver: async () => {} }),
    /not issued/
  );
});

test('deduplicates completed delivery and permits retry after transport failure', async () => {
  const fabric = seeded();
  const envelope = fabric.createEnvelope({
    from: 'angelus',
    to: 'reasoner',
    topic: 'analysis',
    payload: { task: 1 }
  });
  const deliver = async () => {};

  assert.equal((await fabric.send(envelope, { deliver })).status, 'delivered');
  assert.equal((await fabric.send(envelope, { deliver })).status, 'duplicate');

  const retry = fabric.createEnvelope({
    from: 'angelus',
    to: 'reasoner',
    topic: 'analysis',
    payload: { task: 2 }
  });
  assert.equal((await fabric.send(retry, {
    deliver: async () => { throw new Error('offline'); }
  })).status, 'delivery_failed');
  assert.equal((await fabric.send(retry, { deliver })).status, 'delivered');
});

test('broadcast reports per-peer partial delivery', async () => {
  const fabric = seeded();
  fabric.registerNode({
    id: 'quiet',
    capabilities: ['publish:*'],
    subscriptions: ['maintenance']
  });
  const seen = [];
  const result = await fabric.broadcast({
    from: 'angelus',
    topic: 'analysis',
    payload: { finding: 'x' }
  }, {
    deliver: async ({ recipient }) => {
      seen.push(recipient.id);
      if (recipient.id === 'verifier') throw new Error('outage');
    }
  });

  assert.deepEqual(seen, ['coder', 'reasoner', 'verifier']);
  assert.equal(result.targetCount, 3);
  assert.equal(result.status, 'partial');
});

test('bounds payload size and reports no route when every path exceeds the hop limit', async () => {
  const fabric = seeded({ maxMessageBytes: 32, maxHops: 2 });
  assert.throws(() => fabric.createEnvelope({
    from: 'angelus',
    to: 'coder',
    topic: 'code',
    payload: { text: 'x'.repeat(100) }
  }), /size limit/);

  const bounded = seeded({ maxHops: 2 });
  const result = await bounded.send({
    from: 'angelus',
    to: 'verifier',
    topic: 'analysis',
    payload: {}
  }, { deliver: async () => {} });
  assert.equal(result.status, 'unroutable');
});

test('expires messages without attempting delivery', async () => {
  let now = 1000;
  const fabric = seeded({ clock: () => now });
  const envelope = fabric.createEnvelope({
    from: 'angelus',
    to: 'reasoner',
    topic: 'analysis',
    payload: {},
    ttlMs: 100
  });
  now = 1200;

  let calls = 0;
  const result = await fabric.send(envelope, {
    deliver: async () => { calls += 1; }
  });
  assert.equal(result.status, 'expired');
  assert.equal(calls, 0);
});

test('registered policy arrays cannot be mutated through returned objects', () => {
  const fabric = new MycelialFabric();
  const source = fabric.registerNode({
    id: 'source',
    capabilities: ['publish:data'],
    subscriptions: []
  });
  fabric.registerNode({ id: 'target', subscriptions: ['data'] });
  const link = fabric.connect({
    from: 'source',
    to: 'target',
    topics: ['data']
  });

  assert.throws(() => source.capabilities.push('publish:*'), TypeError);
  assert.throws(() => source.subscriptions.push('*'), TypeError);
  assert.throws(() => link.topics.push('*'), TypeError);

  const paused = fabric.setNodeState('source', 'paused');
  assert.throws(() => paused.capabilities.push('publish:*'), TypeError);
  fabric.setNodeState('source', 'active');

  const publicNode = fabric.listNodes().find(node => node.id === 'source');
  publicNode.capabilities.push('publish:*');
  const publicTopology = fabric.topology();
  publicTopology.links[0].topics.push('other');

  assert.throws(() => fabric.createEnvelope({
    from: 'source',
    to: 'target',
    topic: 'other',
    payload: {}
  }), /not authorized/);
  assert.equal(fabric.route('source', 'target', 'other'), null);
});

test('delivery uses an immutable snapshot of the validated JSON payload', async () => {
  const fabric = seeded();
  const payload = { nested: { value: 'validated' }, items: ['one'] };
  const envelope = fabric.createEnvelope({
    from: 'angelus',
    to: 'reasoner',
    topic: 'analysis',
    payload
  });

  payload.nested.value = 'mutated-after-validation';
  payload.items.push('oversized-after-validation');
  assert.deepEqual(envelope.payload, {
    nested: { value: 'validated' },
    items: ['one']
  });
  assert.throws(() => envelope.payload.items.push('tamper'), TypeError);

  let delivered;
  const result = await fabric.send(envelope, {
    deliver: async item => { delivered = item.envelope.payload; }
  });
  assert.equal(result.status, 'delivered');
  assert.deepEqual(delivered, {
    nested: { value: 'validated' },
    items: ['one']
  });
});

test('default TTL is capped by the configured policy', () => {
  const fabric = seeded({ maxTtlMs: 500, clock: () => 1000 });
  const envelope = fabric.createEnvelope({
    from: 'angelus',
    to: 'reasoner',
    topic: 'analysis',
    payload: {}
  });

  assert.equal(envelope.expiresAt, 1500);
  assert.throws(() => fabric.createEnvelope({
    from: 'angelus',
    to: 'reasoner',
    topic: 'analysis',
    payload: {},
    ttlMs: 501
  }), /TTL outside policy/);
});

test('explicit invalid node states are rejected instead of becoming active', () => {
  const fabric = new MycelialFabric();
  assert.equal(fabric.registerNode({ id: 'default-state' }).state, 'active');

  for (const [id, state] of [['empty-state', ''], ['zero-state', 0], ['null-state', null]]) {
    assert.throws(() => fabric.registerNode({ id, state }), /Invalid node state/);
  }
});

test('selects the cheapest route that satisfies the hop limit', async () => {
  const fabric = new MycelialFabric({ maxHops: 2 });
  fabric.registerNode({ id: 'source', capabilities: ['publish:data'] });
  fabric.registerNode({ id: 'long-a' });
  fabric.registerNode({ id: 'long-b' });
  fabric.registerNode({ id: 'target', subscriptions: ['data'] });

  fabric.connect({ from: 'source', to: 'long-a', cost: 1, topics: ['data'] });
  fabric.connect({ from: 'long-a', to: 'long-b', cost: 1, topics: ['data'] });
  fabric.connect({ from: 'long-b', to: 'target', cost: 1, topics: ['data'] });
  fabric.connect({ from: 'source', to: 'long-b', cost: 5, topics: ['data'] });

  assert.deepEqual(fabric.route('source', 'target', 'data'), {
    path: ['source', 'long-b', 'target'],
    hops: 2,
    cost: 6
  });
  const result = await fabric.send({
    from: 'source',
    to: 'target',
    topic: 'data',
    payload: {}
  }, { deliver: async () => {} });
  assert.equal(result.status, 'delivered');
});

test('empty broadcast returns an explicit non-success status', async () => {
  const fabric = seeded();
  const result = await fabric.broadcast({
    from: 'angelus',
    topic: 'unobserved',
    payload: {}
  }, { deliver: async () => {} });

  assert.equal(result.status, 'no_recipients');
  assert.equal(result.targetCount, 0);
  assert.deepEqual(result.deliveries, []);
});

test('broadcast rejects forged wildcard envelopes before addressing recipients', async () => {
  const fabric = seeded();
  let calls = 0;
  const forged = {
    schema: 'heavenzfire.agqi.message.v1',
    messageId: 'forged-broadcast',
    from: 'coder',
    to: '*',
    topic: 'analysis',
    expiresAt: Date.now() + 10000,
    hopLimit: 8,
    payload: {}
  };

  await assert.rejects(
    fabric.broadcast(forged, { deliver: async () => { calls += 1; } }),
    /not issued/
  );
  assert.equal(calls, 0);
});

test('concurrent sends await the in-flight result and allow retry after failure', async () => {
  const fabric = seeded();
  const envelope = fabric.createEnvelope({
    from: 'angelus',
    to: 'reasoner',
    topic: 'analysis',
    payload: { task: 'concurrent' }
  });

  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;

  const first = fabric.send(envelope, {
    deliver: async () => {
      calls += 1;
      await gate;
      throw new Error('temporary outage');
    }
  });
  const second = fabric.send(envelope, {
    deliver: async () => { calls += 1; }
  });

  await Promise.resolve();
  assert.equal(calls, 1);
  release();

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.status, 'delivery_failed');
  assert.equal(secondResult.status, 'delivery_failed');
  assert.equal(calls, 1);

  const retried = await fabric.send(envelope, {
    deliver: async () => { calls += 1; }
  });
  assert.equal(retried.status, 'delivered');
  assert.equal(calls, 2);

  const duplicate = await fabric.send(envelope, {
    deliver: async () => { calls += 1; }
  });
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(calls, 2);
});
