'use strict';

const crypto = require('node:crypto');

const SCHEMA = 'heavenzfire.evidence-anchor-manifest.v1';
const HEX_256 = /^[a-f0-9]{64}$/;

function sha3(bytes) {
  return crypto.createHash('sha3-256').update(bytes).digest('hex');
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 10000) {
    throw new TypeError('entries must contain 1..10000 artifact records');
  }
  const ids = new Set();
  return entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new TypeError('entry ' + index + ' must be an object');
    const artifactId = typeof entry.artifactId === 'string' ? entry.artifactId.trim() : '';
    const sha256 = typeof entry.sha256 === 'string' ? entry.sha256 : '';
    if (!artifactId || artifactId.length > 200) throw new TypeError('entry ' + index + ' has invalid artifactId');
    if (ids.has(artifactId)) throw new Error('duplicate artifactId: ' + artifactId);
    ids.add(artifactId);
    if (!HEX_256.test(sha256)) throw new TypeError('entry ' + index + ' sha256 must be lowercase SHA-256 hex');
    let sourceUrl = null;
    if (entry.sourceUrl != null && entry.sourceUrl !== '') {
      let url;
      try { url = new URL(entry.sourceUrl); } catch { throw new TypeError('entry ' + index + ' sourceUrl must be HTTPS'); }
      if (url.protocol !== 'https:' || url.username || url.password) throw new TypeError('entry ' + index + ' sourceUrl must be HTTPS without credentials');
      sourceUrl = url.toString();
    }
    return { artifactId, sha256, sourceUrl };
  });
}

function leafHash(entry) {
  return sha3(Buffer.concat([Buffer.from([0]), Buffer.from(canonical(entry), 'utf8')]));
}

function merkleRoot(entries) {
  let level = entries.map(leafHash);
  if (level.length === 0) return sha3(Buffer.from([2]));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = Buffer.from(level[i], 'hex');
      const right = Buffer.from(level[i + 1] || level[i], 'hex');
      next.push(sha3(Buffer.concat([Buffer.from([1]), left, right])));
    }
    level = next;
  }
  return level[0];
}

function manifestPayload(manifest) {
  return {
    schema: manifest.schema,
    createdAt: manifest.createdAt,
    hashAlgorithm: manifest.hashAlgorithm,
    leafCount: manifest.leafCount,
    entries: manifest.entries,
    merkleRootSha3_256: manifest.merkleRootSha3_256
  };
}

function createAnchorManifest({ entries, createdAt = new Date().toISOString() }) {
  const normalized = normalizeEntries(entries);
  const timestamp = new Date(createdAt);
  if (!Number.isFinite(timestamp.getTime())) throw new TypeError('createdAt must be a valid timestamp');
  const manifest = {
    schema: SCHEMA,
    createdAt: timestamp.toISOString(),
    hashAlgorithm: 'SHA3-256',
    leafCount: normalized.length,
    entries: normalized,
    merkleRootSha3_256: merkleRoot(normalized)
  };
  manifest.manifestSha3_256 = sha3(Buffer.from(canonical(manifestPayload(manifest)), 'utf8'));
  return manifest;
}

function verifyAnchorManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new TypeError('manifest must be an object');
  if (manifest.schema !== SCHEMA || manifest.hashAlgorithm !== 'SHA3-256') throw new Error('unsupported evidence anchor manifest schema or algorithm');
  const entries = normalizeEntries(manifest.entries);
  if (manifest.leafCount !== entries.length) throw new Error('evidence anchor leaf count mismatch');
  const root = merkleRoot(entries);
  if (manifest.merkleRootSha3_256 !== root) throw new Error('evidence anchor Merkle root mismatch');
  const expected = sha3(Buffer.from(canonical(manifestPayload({ ...manifest, entries })), 'utf8'));
  if (manifest.manifestSha3_256 !== expected) throw new Error('evidence anchor manifest digest mismatch');
  return { ok: true, leafCount: entries.length, merkleRootSha3_256: root, manifestSha3_256: expected };
}

module.exports = { SCHEMA, createAnchorManifest, verifyAnchorManifest, merkleRoot };
