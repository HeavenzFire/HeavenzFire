'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runAssessment, isPublicAddress, resolvePublic } = require('./passive-assessment.cjs');
const { SCHEMA } = require('./scope-policy.cjs');

function scope(overrides = {}) {
  return {
    schema: SCHEMA, scopeId: 'poc-001', owner: 'lab-owner', authorizedBy: 'operator',
    authorizationRef: 'approval-001', authorizedAt: '2026-11-01T00:00:00.000Z',
    expiresAt: '2026-11-03T00:00:00.000Z', targets: ['example.org'],
    allowedChecks: ['dns_records','tls_certificate','http_security_headers','http_metadata'],
    ...overrides
  };
}

test('requires explicit approval and exact in-scope target before adapter work', async () => {
  let calls = 0;
  const resolver = { resolve: async () => { calls++; return []; }, lookup: async () => [{address:'93.184.216.34',family:4}] };
  await assert.rejects(runAssessment({ scope: scope(), target:'example.org', checks:['dns_records'], approved:false, now:'2026-11-01T12:00:00Z', taskId:'t1', resolver }), /human_approval_required/);
  await assert.rejects(runAssessment({ scope: scope(), target:'other.example.org', checks:['dns_records'], approved:true, now:'2026-11-01T12:00:00Z', taskId:'t1', resolver }), /target_out_of_scope/);
  assert.equal(calls, 0);
});

test('records authorized passive DNS observations with injected resolver', async () => {
  const resolver = { resolve: async (_host,type) => type === 'A' ? ['93.184.216.34'] : [], lookup: async () => [{address:'93.184.216.34',family:4}] };
  const result = await runAssessment({ scope:scope(), target:'example.org', checks:['dns_records'], approved:true, now:'2026-11-01T12:00:00Z', taskId:'t2', resolver });
  assert.equal(result.observations.length,1);
  assert.deepEqual(result.observations[0].result.records.A,['93.184.216.34']);
});

test('rejects non-public and mixed public/private DNS answers', async () => {
  assert.equal(isPublicAddress('93.184.216.34'),true);
  assert.equal(isPublicAddress('127.0.0.1'),false);
  assert.equal(isPublicAddress('10.0.0.1'),false);
  await assert.rejects(resolvePublic('example.org',{lookup:async()=>[{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}]}),/non_public/);
});

test('checks every redirect destination before requesting it', async () => {
  const requested = [];
  const resolver = { lookup: async host => [{address:host === 'example.org' ? '93.184.216.34' : '127.0.0.1',family:4}] };
  const requester = async host => { requested.push(host); return {statusCode:302,headers:{},location:'https://internal.example/'}; };
  const { inspectHeaders } = require('./passive-assessment.cjs');
  await assert.rejects(inspectHeaders('example.org',resolver,requester),/non_public/);
  assert.deepEqual(requested,['example.org']);
});

test('persists observations to the tamper-evident evidence ledger', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { verifyLedger } = require('../FieldCore/evidence-ledger.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'sentinel-poc-'));
  try {
    const ledgerPath = path.join(dir,'evidence.jsonl');
    const resolver = { resolve: async (_host,type) => type === 'A' ? ['93.184.216.34'] : [], lookup: async () => [{address:'93.184.216.34',family:4}] };
    const result = await runAssessment({scope:scope(),target:'example.org',checks:['dns_records'],approved:true,now:'2026-11-01T12:00:00Z',taskId:'t3',ledgerPath,resolver});
    assert.equal(result.observations[0].evidence.verification.ok,true);
    assert.equal(verifyLedger(ledgerPath).count,1);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
