'use strict';

const crypto = require('node:crypto');

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const TOPIC = /^[a-z0-9][a-z0-9._-]{0,95}$/;
const MESSAGE_SCHEMA = 'heavenzfire.agqi.message.v1';

function id(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new Error(label + ' is invalid');
  }
}

function topic(value) {
  if (typeof value !== 'string' || !TOPIC.test(value)) {
    throw new Error('Topic is invalid');
  }
}

function freezeJson(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

class MycelialFabric {
  constructor({ maxMessageBytes = 65536, maxHops = 8, maxTtlMs = 120000, clock = Date.now } = {}) {
    if (!Number.isInteger(maxMessageBytes) || maxMessageBytes < 1) {
      throw new Error('Invalid message limit');
    }
    if (!Number.isInteger(maxHops) || maxHops < 1 || maxHops > 64) {
      throw new Error('Invalid hop limit');
    }
    if (!Number.isInteger(maxTtlMs) || maxTtlMs < 100 || maxTtlMs > 3600000) {
      throw new Error('Invalid TTL limit');
    }
    if (typeof clock !== 'function') throw new Error('Invalid clock');

    this.maxMessageBytes = maxMessageBytes;
    this.maxHops = maxHops;
    this.maxTtlMs = maxTtlMs;
    this.clock = clock;
    this.nodes = new Map();
    this.edges = new Map();
    this.seen = new Map();
    this.issued = new WeakSet();
  }

  registerNode(definition) {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      throw new Error('Node definition required');
    }
    id(definition.id, 'Node id');
    if (this.nodes.has(definition.id)) throw new Error('Node already registered');

    const rawCapabilities = definition.capabilities === undefined ? [] : definition.capabilities;
    const rawSubscriptions = definition.subscriptions === undefined ? [] : definition.subscriptions;
    if (!Array.isArray(rawCapabilities) || !Array.isArray(rawSubscriptions)) {
      throw new Error('Capabilities and subscriptions must be arrays');
    }

    const capabilities = [...new Set(rawCapabilities)];
    const subscriptions = [...new Set(rawSubscriptions)];
    if (capabilities.some(value => typeof value !== 'string' || value.length < 1 || value.length > 96)) {
      throw new Error('Invalid capabilities');
    }
    for (const value of subscriptions) {
      if (value !== '*') topic(value);
    }

    const state = definition.state === undefined ? 'active' : definition.state;
    if (!['active', 'paused', 'offline'].includes(state)) throw new Error('Invalid node state');

    const node = Object.freeze({
      id: definition.id,
      kind: String(definition.kind || 'agent'),
      trustDomain: String(definition.trustDomain || 'local'),
      capabilities: Object.freeze(capabilities),
      subscriptions: Object.freeze(subscriptions),
      state
    });

    this.nodes.set(node.id, node);
    this.edges.set(node.id, new Map());
    return node;
  }

  setNodeState(nodeId, state) {
    id(nodeId, 'Node id');
    if (!['active', 'paused', 'offline'].includes(state)) throw new Error('Invalid node state');
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error('Unknown node');

    const next = Object.freeze({ ...node, state });
    this.nodes.set(nodeId, next);
    return next;
  }

  connect({ from, to, cost = 1, topics = ['*'], bidirectional = false }) {
    id(from, 'Source');
    id(to, 'Destination');
    if (from === to) throw new Error('Self-links forbidden');
    if (!this.nodes.has(from) || !this.nodes.has(to)) {
      throw new Error('Both nodes must be registered');
    }
    if (!Number.isFinite(cost) || cost <= 0 || cost > 1000000) {
      throw new Error('Invalid link cost');
    }
    if (!Array.isArray(topics) || topics.length === 0) throw new Error('Link topics required');

    const allowed = Object.freeze([...new Set(topics)]);
    for (const value of allowed) {
      if (value !== '*') topic(value);
    }

    const edge = Object.freeze({ cost, topics: allowed });
    this.edges.get(from).set(to, edge);
    if (bidirectional) this.edges.get(to).set(from, edge);

    return Object.freeze({ from, to, cost, topics: allowed, bidirectional });
  }

  disconnect(from, to, { bidirectional = false } = {}) {
    id(from, 'Source');
    id(to, 'Destination');
    const removed = this.edges.get(from)?.delete(to) || false;
    if (bidirectional) this.edges.get(to)?.delete(from);
    return removed;
  }

  listNodes() {
    return [...this.nodes.values()].map(node => ({
      ...node,
      capabilities: [...node.capabilities],
      subscriptions: [...node.subscriptions]
    }));
  }

  topology() {
    const links = [];
    for (const [from, targets] of this.edges) {
      for (const [to, edge] of targets) {
        links.push({ from, to, cost: edge.cost, topics: [...edge.topics] });
      }
    }
    return { nodeCount: this.nodes.size, linkCount: links.length, nodes: this.listNodes(), links };
  }

  route(from, to, topicName) {
    id(from, 'Source');
    id(to, 'Destination');
    topic(topicName);

    const source = this.nodes.get(from);
    const destination = this.nodes.get(to);
    if (!source || !destination) throw new Error('Unknown route endpoint');
    if (source.state !== 'active' || destination.state !== 'active') return null;

    // Dijkstra over (node, hop-count) states. This finds the cheapest route
    // that satisfies the hop bound instead of rejecting an unconstrained path.
    const stateKey = (nodeId, hops) => nodeId + '\u0000' + hops;
    const startKey = stateKey(from, 0);
    const distances = new Map([[startKey, 0]]);
    const states = new Map([[startKey, { node: from, hops: 0 }]]);
    const previous = new Map();
    const pending = new Set([startKey]);
    let targetKey = null;

    while (pending.size > 0) {
      let currentKey = null;
      let bestDistance = Infinity;
      for (const key of pending) {
        const distance = distances.get(key);
        if (distance < bestDistance) {
          currentKey = key;
          bestDistance = distance;
        }
      }
      if (currentKey === null) break;

      pending.delete(currentKey);
      const current = states.get(currentKey);
      if (current.node === to) {
        targetKey = currentKey;
        break;
      }
      if (current.hops >= this.maxHops) continue;

      for (const [nextId, edge] of this.edges.get(current.node) || []) {
        const nextNode = this.nodes.get(nextId);
        if (!nextNode || nextNode.state !== 'active') continue;
        if (!edge.topics.includes('*') && !edge.topics.includes(topicName)) continue;

        const nextHops = current.hops + 1;
        const nextKey = stateKey(nextId, nextHops);
        const candidateDistance = bestDistance + edge.cost;
        if (candidateDistance < (distances.get(nextKey) ?? Infinity)) {
          distances.set(nextKey, candidateDistance);
          states.set(nextKey, { node: nextId, hops: nextHops });
          previous.set(nextKey, currentKey);
          pending.add(nextKey);
        }
      }
    }

    if (targetKey === null) return null;

    const path = [];
    let cursor = targetKey;
    while (cursor !== undefined) {
      path.unshift(states.get(cursor).node);
      cursor = previous.get(cursor);
    }
    return {
      path,
      hops: states.get(targetKey).hops,
      cost: distances.get(targetKey)
    };
  }

  createEnvelope(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Envelope input required');
    }

    const {
      from,
      to,
      topic: topicName,
      payload,
      correlationId = null,
      ttlMs
    } = input;
    const effectiveTtlMs = ttlMs === undefined ? Math.min(30000, this.maxTtlMs) : ttlMs;

    id(from, 'Sender');
    if (to !== '*') id(to, 'Recipient');
    topic(topicName);

    const sender = this.nodes.get(from);
    if (!sender || sender.state !== 'active') throw new Error('Sender inactive');
    if (
      !sender.capabilities.includes('*') &&
      !sender.capabilities.includes('publish:*') &&
      !sender.capabilities.includes('publish:' + topicName)
    ) {
      throw new Error('Sender not authorized');
    }
    if (!Number.isInteger(effectiveTtlMs) || effectiveTtlMs < 100 || effectiveTtlMs > this.maxTtlMs) {
      throw new Error('TTL outside policy');
    }

    let serializedPayload;
    try {
      serializedPayload = JSON.stringify(payload);
    } catch {
      throw new Error('Payload must be JSON serializable');
    }
    if (
      typeof serializedPayload !== 'string' ||
      Buffer.byteLength(serializedPayload) > this.maxMessageBytes
    ) {
      throw new Error('Payload size limit exceeded');
    }

    if (correlationId !== null) id(correlationId, 'Correlation id');

    // Deliver the exact immutable JSON snapshot whose byte length was checked.
    const payloadSnapshot = freezeJson(JSON.parse(serializedPayload));
    const now = this.clock();
    if (!Number.isFinite(now)) throw new Error('Clock must return finite milliseconds');

    const envelope = Object.freeze({
      schema: MESSAGE_SCHEMA,
      messageId: crypto.randomUUID(),
      correlationId,
      from,
      to,
      topic: topicName,
      createdAt: new Date(now).toISOString(),
      expiresAt: now + effectiveTtlMs,
      hopLimit: this.maxHops,
      payload: payloadSnapshot
    });

    this.issued.add(envelope);
    return envelope;
  }

  async send(input, { deliver } = {}) {
    if (typeof deliver !== 'function') throw new Error('Transport delivery adapter required');

    const isEnvelope = input && typeof input === 'object' && input.schema === MESSAGE_SCHEMA;
    const envelope = isEnvelope ? input : this.createEnvelope(input);
    if (!this.issued.has(envelope)) throw new Error('Envelope was not issued by this fabric');
    if (envelope.to === '*') throw new Error('Use broadcast for wildcard');

    const now = this.clock();
    for (const [key, record] of this.seen) {
      if (record.expiresAt <= now) this.seen.delete(key);
    }
    if (now >= envelope.expiresAt) {
      return { status: 'expired', messageId: envelope.messageId };
    }

    const key = envelope.messageId + ':' + envelope.to;
    const existing = this.seen.get(key);
    if (existing) {
      if (existing.promise) return existing.promise;
      return { status: 'duplicate', messageId: envelope.messageId };
    }

    const route = this.route(envelope.from, envelope.to, envelope.topic);
    if (!route) return { status: 'unroutable', messageId: envelope.messageId };
    if (route.hops > envelope.hopLimit) {
      return { status: 'hop_limit_exceeded', messageId: envelope.messageId };
    }

    const recipientNode = this.nodes.get(envelope.to);
    if (
      !recipientNode.subscriptions.includes('*') &&
      !recipientNode.subscriptions.includes(envelope.topic)
    ) {
      return { status: 'not_subscribed', messageId: envelope.messageId };
    }

    const record = { expiresAt: envelope.expiresAt, promise: null };
    this.seen.set(key, record);

    // Defer adapter invocation one microtask so the in-flight promise is
    // installed before a re-entrant or concurrent send can observe the record.
    record.promise = Promise.resolve().then(async () => {
      try {
        await deliver({
          envelope,
          route,
          recipient: {
            id: recipientNode.id,
            kind: recipientNode.kind,
            trustDomain: recipientNode.trustDomain
          }
        });
        record.promise = null;
        return { status: 'delivered', messageId: envelope.messageId, route };
      } catch (error) {
        if (this.seen.get(key) === record) this.seen.delete(key);
        return {
          status: 'delivery_failed',
          messageId: envelope.messageId,
          error: String(error?.message || error)
        };
      }
    });

    return record.promise;
  }

  async broadcast(input, { deliver } = {}) {
    if (typeof deliver !== 'function') throw new Error('Transport delivery adapter required');

    const isEnvelope = input && typeof input === 'object' && input.schema === MESSAGE_SCHEMA;
    const envelope = isEnvelope
      ? input
      : this.createEnvelope({ ...input, to: '*' });

    if (!this.issued.has(envelope) || envelope.to !== '*') {
      throw new Error('Broadcast envelope was not issued by this fabric');
    }
    if (this.clock() >= envelope.expiresAt) {
      return { status: 'expired', messageId: envelope.messageId, targetCount: 0, deliveries: [] };
    }

    const targets = [...this.nodes.values()]
      .filter(node =>
        node.id !== envelope.from &&
        node.state === 'active' &&
        (node.subscriptions.includes('*') || node.subscriptions.includes(envelope.topic))
      )
      .map(node => node.id)
      .sort();

    if (targets.length === 0) {
      return {
        status: 'no_recipients',
        messageId: envelope.messageId,
        targetCount: 0,
        deliveries: []
      };
    }

    const deliveries = [];
    for (const to of targets) {
      const addressed = Object.freeze({ ...envelope, to });
      this.issued.add(addressed);
      deliveries.push({ to, ...await this.send(addressed, { deliver }) });
    }

    return {
      status: deliveries.every(result =>
        result.status === 'delivered' || result.status === 'duplicate'
      ) ? 'delivered' : 'partial',
      messageId: envelope.messageId,
      targetCount: targets.length,
      deliveries
    };
  }
}

module.exports = { MycelialFabric };
