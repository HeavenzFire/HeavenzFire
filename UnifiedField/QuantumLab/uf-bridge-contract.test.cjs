'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PROTOCOL_VERSION, validateHandshake, classifyConnectivity, planReplay } = require('./uf-bridge-contract.cjs');

const request = {
  protocol: PROTOCOL_VERSION,
  nonce: 'nonce-1234567890abcdef',
  capabilities: ['github.read', 'queue.inspect'],
  scopes: ['repo:read']
};
const response = {
  protocol: PROTOCOL_VERSION,
  nonce: request.nonce,
  adapter_id: 'local-test-adapter',
  capabilities: ['github.read', 'queue.inspect', 'extra.capability'],
  granted_scopes: ['repo:read', 'extra:scope']
};

test('validates nonce, protocol, and least-privilege requested scopes', () => {
  const out = validateHandshake(request, response);
  assert.equal(out.accepted, true);
  assert.deepEqual(out.capabilities, request.capabilities);
  assert.deepEqual(out.scopes, request.scopes);
  assert.equal(out.executionAuthorized, undefined);
});
test('rejects stale or mismatched nonce', () => {
  assert.equal(validateHandshake(request, { ...response, nonce: 'different-nonce-123456' }).code, 'NONCE_MISMATCH');
});
test('rejects protocol mismatch', () => {
  assert.equal(validateHandshake(request, { ...response, protocol: 'UF-BRIDGE/9.9' }).code, 'PROTOCOL_MISMATCH');
});
test('denies capabilities or scopes not granted by adapter', () => {
  const out = validateHandshake({ ...request, scopes: ['repo:read', 'repo:write'] }, response);
  assert.equal(out.accepted, false);
  assert.equal(out.code, 'CAPABILITY_SCOPE_DENIED');
  assert.deepEqual(out.missingScopes, ['repo:write']);
});
test('rejects duplicate capability declarations', () => {
  const out = validateHandshake({ ...request, capabilities: ['github.read', 'github.read'] }, response);
  assert.equal(out.code, 'INVALID_CAPABILITY_MANIFEST');
});
test('connectivity is based only on supplied reachability evidence', () => {
  assert.equal(classifyConnectivity([{ name: 'github', reachable: true }, { name: 'local', reachable: true }]), 'ONLINE');
  assert.equal(classifyConnectivity([{ name: 'github', reachable: false }, { name: 'local', reachable: false }]), 'OFFLINE');
  assert.equal(classifyConnectivity([{ name: 'github', reachable: false }, { name: 'local', reachable: true }]), 'DEGRADED');
  assert.equal(classifyConnectivity([]), 'DEGRADED');
});
test('offline and reconnecting modes defer tasks without losing order', () => {
  const tasks = [{ task_id: 'a' }, { task_id: 'b' }];
  assert.deepEqual(planReplay(tasks, 'sha', 'OFFLINE').map(x => x.task_id), ['a', 'b']);
  assert.ok(planReplay(tasks, 'sha', 'OFFLINE').every(x => x.action === 'DEFER'));
});
test('degraded mode holds work rather than guessing connectivity', () => {
  assert.equal(planReplay([{ task_id: 'a' }], 'sha', 'DEGRADED')[0].action, 'HOLD');
});
test('revision drift is a conflict and never execution authorization', () => {
  const out = planReplay([{ task_id: 'a', status: 'QUEUED', target_commit_sha: 'old' }], 'new', 'ONLINE')[0];
  assert.equal(out.action, 'CONFLICT');
});
test('matching target only becomes eligible for revalidation, never execution', () => {
  const out = planReplay([{ task_id: 'a', status: 'QUEUED', target_commit_sha: 'same' }], 'same', 'ONLINE')[0];
  assert.equal(out.action, 'ELIGIBLE_FOR_REVALIDATION');
  assert.equal(out.executionAuthorized, false);
});
test('running and unknown-state tasks are held to prevent duplicate replay', () => {
  assert.equal(planReplay([{ task_id: 'running', status: 'RUNNING' }], 'sha', 'ONLINE')[0].action, 'HOLD');
  assert.equal(planReplay([{ task_id: 'running', status: 'RUNNING' }], 'sha', 'ONLINE')[0].reason, 'UNSUPPORTED_TASK_STATE');
  assert.equal(planReplay([{ task_id: 'unknown', status: 'MYSTERY' }], 'sha', 'ONLINE')[0].reason, 'UNSUPPORTED_TASK_STATE');
});
test('missing current revision cannot produce replay eligibility', () => {
  const out = planReplay([{ task_id: 'a', status: 'QUEUED' }], null, 'ONLINE')[0];
  assert.equal(out.action, 'HOLD');
  assert.equal(out.reason, 'CURRENT_REVISION_UNAVAILABLE');
});
test('completed tasks are never replayed', () => {
  assert.equal(planReplay([{ task_id: 'a', status: 'DONE' }], 'sha', 'ONLINE')[0].action, 'SKIP_ALREADY_DONE');
});
