'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEnvelope, validateEnvelope, TransportRegistry } = require('./fabric-envelope.cjs');

test('creates and validates a versioned envelope', () => {
  const message = createEnvelope({ type: 'heartbeat', source: 'windows-zdh', payload: { state: 'online' } });
  assert.equal(validateEnvelope(message), true);
  assert.equal(message.protocol, 'heavenzfire.fabric.v1');
});

test('rejects unsupported message types', () => {
  assert.throws(() => createEnvelope({ type: 'execute-anything', source: 'test', payload: {} }), /Unsupported message type/);
});

test('broadcast goes only to transports that explicitly support broadcast', async () => {
  const registry = new TransportRegistry();
  const called = [];
  registry.register({ name: 'unicast', send: async () => called.push('unicast') });
  registry.register({ name: 'broadcast', supportsBroadcast: true, send: async () => called.push('broadcast') });
  const message = createEnvelope({ type: 'discovery', source: 'test', payload: { role: 'worker' } });
  const result = await registry.dispatch(message);
  assert.deepEqual(called, ['broadcast']);
  assert.deepEqual(result.deliveredBy, ['broadcast']);
});

test('deduplicates repeated message ids', async () => {
  const registry = new TransportRegistry();
  let sends = 0;
  registry.register({ name: 'test', supportsBroadcast: true, send: async () => { sends += 1; } });
  const message = createEnvelope({ type: 'event', source: 'test', payload: { n: 1 } });
  assert.equal((await registry.dispatch(message)).status, 'dispatched');
  assert.equal((await registry.dispatch(message)).status, 'duplicate');
  assert.equal(sends, 1);
});

test('isolates transport failures and continues dispatching', async () => {
  const registry = new TransportRegistry();
  registry.register({ name: 'broken', supportsBroadcast: true, send: async () => { throw new Error('offline'); } });
  registry.register({ name: 'healthy', supportsBroadcast: true, send: async () => {} });
  const result = await registry.dispatch(createEnvelope({ type: 'event', source: 'test', payload: {} }));
  assert.deepEqual(result.deliveredBy, ['healthy']);
  assert.equal(result.failures.length, 1);
});