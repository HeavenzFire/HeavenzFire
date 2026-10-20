'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { appendEvidence, verifyLedger, ZERO_HASH } = require('./evidence-ledger.cjs');

function withLedger(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-evidence-ledger-'));
  const ledgerPath = path.join(dir, 'evidence.jsonl');
  try { callback(ledgerPath); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function evidence(overrides = {}) {
  return {
    taskId: 'task-1',
    kind: 'source_observation',
    summary: 'A bounded source observation was recorded.',
    sourceUrl: 'https://example.org/report',
    actor: 'test-suite',
    observedAt: '2026-10-20T12:00:00.000Z',
    ...overrides
  };
}

test('appends evidence entries with a verifiable SHA-256 chain', () => {
  withLedger(ledgerPath => {
    const first = appendEvidence(ledgerPath, evidence());
    const second = appendEvidence(ledgerPath, evidence({ kind: 'verification', summary: 'A second observation.' }));
    assert.equal(first.sequence, 1);
    assert.equal(first.previousHash, ZERO_HASH);
    assert.equal(second.sequence, 2);
    assert.equal(second.previousHash, first.entryHash);
    assert.match(second.entryHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(verifyLedger(ledgerPath), { ok: true, count: 2, headHash: second.entryHash });
  });
});

test('rejects embedded credentials, unsafe protocols, and malformed artifact hashes', () => {
  withLedger(ledgerPath => {
    assert.throws(() => appendEvidence(ledgerPath, evidence({ sourceUrl: 'javascript:alert(1)' })), /HTTP\(S\)/);
    assert.throws(() => appendEvidence(ledgerPath, evidence({ sourceUrl: 'https://user:pass@example.org/' })), /without embedded credentials/);
    assert.throws(() => appendEvidence(ledgerPath, evidence({ artifactSha256: 'not-a-hash' })), /SHA-256/);
    assert.equal(verifyLedger(ledgerPath).count, 0);
  });
});

test('detects tampering and broken chain links', () => {
  withLedger(ledgerPath => {
    appendEvidence(ledgerPath, evidence());
    appendEvidence(ledgerPath, evidence({ kind: 'verification', summary: 'Second item.' }));
    const lines = fs.readFileSync(ledgerPath, 'utf8').trim().split(/\r?\n/);
    const changed = JSON.parse(lines[0]);
    changed.event.summary = 'Edited after recording.';
    lines[0] = JSON.stringify(changed);
    fs.writeFileSync(ledgerPath, lines.join('\n') + '\n', 'utf8');
    assert.throws(() => verifyLedger(ledgerPath), /Hash mismatch/);
  });
});

test('rejects invalid sequence, non-canonical events, and invalid JSON', () => {
  withLedger(ledgerPath => {
    appendEvidence(ledgerPath, evidence());
    const entry = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    entry.sequence = 4;
    fs.writeFileSync(ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
    assert.throws(() => verifyLedger(ledgerPath), /Invalid sequence/);
    fs.writeFileSync(ledgerPath, '{broken\n', 'utf8');
    assert.throws(() => verifyLedger(ledgerPath), /Invalid JSON/);
  });
});
