'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MycelialFabric } = require('./mycelial-fabric.cjs');

function seeded(options = {}) {
  const f = new MycelialFabric(options);
  f.registerNode({ id: 'angelus', kind: 'coordinator', capabilities: ['publish:*'], subscriptions: ['*'] });
  f.registerNode({ id: 'reasoner', capabilities: ['publish:*'], subscriptions: ['analysis', 'critique'] });
  f.registerNode({ id: 'coder', capabilities: ['publish:code'], subscriptions: ['code', 'analysis'] });
  f.registerNode({ id: 'verifier', capabilities: ['publish:analysis'], subscriptions: ['analysis'] });
  f.connect({ from: 'angelus', to: 'reasoner', cost: 1 });
  f.connect({ from: 'reasoner', to: 'coder', cost: 1, topics: ['code', 'analysis'] });
  f.connect({ from: 'coder', to: 'verifier', cost: 1, topics: ['analysis'] });
  f.connect({ from: 'angelus', to: 'verifier', cost: 8, topics: ['maintenance'] });
  return f;
}

test('routes over the lowest-cost eligible path and exposes topology', () => {
  const f = seeded();
  assert.deepEqual(f.route('angelus', 'verifier', 'analysis'), {
    path: ['angelus', 'reasoner', 'coder', 'verifier'], hops: 3, cost: 3
  });
  assert.equal(f.topology().nodeCount, 4);
  assert.equal(f.topology().linkCount, 4);
});

test('rejects unknown nodes, malformed topics and unauthorized publishers', () => {
  const f = seeded();
  assert.throws(() => f.connect({ from: 'missing', to: 'coder' }), /registered/);
  assert.throws(() => f.route('angelus', 'coder', 'Bad Topic'), /Topic/);
  assert.throws(() => f.createEnvelope({ from: 'coder', to: 'reasoner', topic: 'analysis', payload: {} }), /authorized/);
});

test('delivers only to subscribed active recipients', async () => {
  const f = seeded();
  const received = [];
  const result = await f.send({ from: 'angelus', to: 'coder', topic: 'code', payload: { request: 'review' } }, {
    deliver: async item => received.push(item)
  });
  assert.equal(result.status, 'delivered');
  assert.deepEqual(result.route.path, ['angelus', 'reasoner', 'coder']);
  assert.equal(received.length, 1);
  f.setNodeState('reasoner', 'offline');
  assert.equal(f.route('angelus', 'coder', 'code'), null);
});

test('rejects caller-forged envelopes before delivery', async () => {
  const f = seeded();
  const forged = {
    schema: 'heavenzfire.agqi.message.v1', messageId: 'forged', from: 'coder',
    to: 'reasoner', topic: 'analysis', expiresAt: Date.now() + 10000,
    hopLimit: 8, payload: {}
  };
  await assert.rejects(f.send(forged, { deliver: async () => {} }), /not issued/);
});

test('deduplicates delivery and permits retry after transport failure', async () => {
  const f = seeded();
  const envelope = f.createEnvelope({ from: 'angelus', to: 'reasoner', topic: 'analysis', payload: { task: 1 } });
  const deliver = async () => {};
  assert.equal((await f.send(envelope, { deliver })).status, 'delivered');
  assert.equal((await f.send(envelope, { deliver })).status, 'duplicate');
  const retry = f.createEnvelope({ from: 'angelus', to: 'reasoner', topic: 'analysis', payload: { task: 2 } });
  assert.equal((await f.send(retry, { deliver: async () => { throw Error('offline'); } })).status, 'delivery_failed');
  assert.equal((await f.send(retry, { deliver })).status, 'delivered');
});

test('broadcast reports per-peer partial delivery', async () => {
  const f = seeded();
  f.registerNode({ id: 'quiet', capabilities: ['publish:*'], subscriptions: ['maintenance'] });
  const seen = [];
  const result = await f.broadcast({ from: 'angelus', topic: 'analysis', payload: { finding: 'x' } }, {
    deliver: async ({ recipient }) => {
      seen.push(recipient.id);
      if (recipient.id === 'verifier') throw Error('outage');
    }
  });
  assert.deepEqual(seen, ['coder', 'reasoner', 'verifier']);
  assert.equal(result.targetCount, 3);
  assert.equal(result.status, 'partial');
});

test('bounds payload size and hop count', async () => {
  const f = seeded({ maxMessageBytes: 32, maxHops: 2 });
  assert.throws(() => f.createEnvelope({ from: 'angelus', to: 'coder', topic: 'code', payload: { text: 'x'.repeat(100) } }), /size limit/);
  const g = seeded({ maxHops: 2 });
  assert.equal((await g.send({ from: 'angelus', to: 'verifier', topic: 'analysis', payload: {} }, { deliver: async () => {} })).status, 'unroutable');
});

test('expires messages without attempting delivery', async () => {
  let now = 1000;
  const f = seeded({ clock: () => now });
  const envelope = f.createEnvelope({ from: 'angelus', to: 'reasoner', topic: 'analysis', payload: {}, ttlMs: 100 });
  now = 1200;
  let calls = 0;
  const result = await f.send(envelope, { deliver: async () => { calls++; } });
  assert.equal(result.status, 'expired');
  assert.equal(calls, 0);
});
