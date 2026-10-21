'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyLedger } = require('./evidence-ledger.cjs');
const { validatePublicRecord, ingestPublicRecord } = require('./public-record-adapter.cjs');

function withLedger(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-public-record-'));
  const ledgerPath = path.join(dir, 'evidence.jsonl');
  try { callback(ledgerPath); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function record(overrides = {}) {
  return {
    taskId: 'audit-task-01',
    sourceName: 'Example public records API',
    recordId: 'award-2026-001',
    title: 'Award summary',
    summary: 'The record reports an award amount and recipient.',
    sourceUrl: 'https://api.example.gov/v1/awards/award-2026-001',
    retrievedAt: '2026-10-20T12:00:00.000Z',
    rawContent: '{"id":"award-2026-001","amount":1000}',
    ...overrides
  };
}

test('validates an explicitly allowlisted HTTPS source and hashes raw record bytes', () => {
  const normalized = validatePublicRecord(record(), ['example.gov']);
  assert.equal(normalized.sourceName, 'Example public records API');
  assert.equal(normalized.recordId, 'award-2026-001');
  assert.equal(normalized.artifactSha256, crypto.createHash('sha256').update(record().rawContent).digest('hex'));
});

test('rejects lookalike hosts, non-HTTPS URLs, credentials, and absent allowlists', () => {
  assert.throws(() => validatePublicRecord(record({ sourceUrl: 'https://example.gov.attacker.test/record' }), ['example.gov']), /allowlist/);
  assert.throws(() => validatePublicRecord(record({ sourceUrl: 'http://api.example.gov/record' }), ['example.gov']), /HTTPS/);
  assert.throws(() => validatePublicRecord(record({ sourceUrl: 'https://user:pass@api.example.gov/record' }), ['example.gov']), /credentials/);
  assert.throws(() => validatePublicRecord(record(), []), /explicit allowlist/);
});

test('ingests a record into the ledger with source, record ID, timestamp, and artifact hash', () => {
  withLedger(ledgerPath => {
    const result = ingestPublicRecord({ ledgerPath, record: record(), allowedHosts: ['example.gov'] });
    assert.equal(result.ledgerEntry.event.kind, 'public_record');
    assert.equal(result.ledgerEntry.event.taskId, 'audit-task-01');
    assert.match(result.ledgerEntry.event.summary, /award-2026-001/);
    assert.equal(result.ledgerEntry.event.sourceUrl, record().sourceUrl);
    assert.equal(verifyLedger(ledgerPath).count, 1);
  });
});

test('rejects altered artifact hashes, oversized raw content, and malformed record metadata', () => {
  assert.throws(() => validatePublicRecord(record({ artifactSha256: '0'.repeat(64) }), ['example.gov']), /does not match/);
  assert.throws(() => validatePublicRecord(record({ rawContent: 'x'.repeat(1024 * 1024 + 1) }), ['example.gov']), /1 MiB/);
  assert.throws(() => validatePublicRecord(record({ recordId: '  ' }), ['example.gov']), /recordId/);
});
