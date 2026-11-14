'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createAnchorManifest, verifyAnchorManifest } = require('./anchor-manifest.cjs');

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const entries = [
  { artifactId: 'record-001', sha256: digest('first'), sourceUrl: 'https://agency.example.gov/records/1' },
  { artifactId: 'record-002', sha256: digest('second'), sourceUrl: 'https://agency.example.gov/records/2' },
  { artifactId: 'record-003', sha256: digest('third') }
];

test('creates and verifies a deterministic SHA3-256 Merkle manifest', () => {
  const a = createAnchorManifest({ entries, createdAt: '2026-11-13T20:00:00.000Z' });
  const b = createAnchorManifest({ entries, createdAt: '2026-11-13T20:00:00.000Z' });
  assert.deepEqual(a, b);
  assert.equal(a.hashAlgorithm, 'SHA3-256');
  assert.equal(a.leafCount, 3);
  assert.equal(verifyAnchorManifest(a).ok, true);
});

test('detects changed artifact records and changed roots', () => {
  const manifest = createAnchorManifest({ entries, createdAt: '2026-11-13T20:00:00.000Z' });
  const altered = structuredClone(manifest);
  altered.entries[0].sha256 = digest('tampered');
  assert.throws(() => verifyAnchorManifest(altered), /Merkle root mismatch/);
});

test('rejects duplicate IDs, malformed hashes, non-HTTPS sources, and invalid timestamps', () => {
  assert.throws(() => createAnchorManifest({ entries: [entries[0], entries[0]] }), /duplicate artifactId/);
  assert.throws(() => createAnchorManifest({ entries: [{ artifactId: 'x', sha256: 'bad' }] }), /SHA-256/);
  assert.throws(() => createAnchorManifest({ entries: [{ artifactId: 'x', sha256: digest('x'), sourceUrl: 'http://example.gov' }] }), /HTTPS/);
  assert.throws(() => createAnchorManifest({ entries, createdAt: 'not-a-date' }), /valid timestamp/);
});

test('rejects altered manifest digest', () => {
  const manifest = createAnchorManifest({ entries });
  manifest.manifestSha3_256 = '0'.repeat(64);
  assert.throws(() => verifyAnchorManifest(manifest), /manifest digest mismatch/);
});
