'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { latestWorkerResults } = require('./worker-result-store.cjs');

function write(dir, name, data, mtime) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(data), 'utf8');
  fs.utimesSync(file, mtime, mtime);
}

test('per-model latest results preserve successful peers after a single-model retry', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-result-store-'));
  try {
    const older = new Date('2026-01-01T00:00:00Z');
    const newer = new Date('2026-01-01T00:01:00Z');
    write(dir, 'worker-smoke-older.json', [
      { model: 'qwen2.5:0.5b', ok: true, validation: { passed: true } },
      { model: 'llama3.2:1b', ok: false, validation: { passed: false } }
    ], older);
    write(dir, 'worker-smoke-retry.json', [
      { model: 'llama3.2:1b', ok: true, validation: { passed: true } }
    ], newer);
    const latest = latestWorkerResults(dir);
    assert.equal(latest.file, 'worker-smoke-retry.json');
    assert.equal(latest.artifacts_seen, 2);
    assert.equal(latest.results.length, 2);
    assert.equal(latest.results.find(x => x.model === 'qwen2.5:0.5b').validation.passed, true);
    assert.equal(latest.results.find(x => x.model === 'llama3.2:1b').validation.passed, true);
    assert.equal(latest.results.find(x => x.model === 'llama3.2:1b').artifact_file, 'worker-smoke-retry.json');
    assert.equal(latest.results.find(x => x.model === 'qwen2.5:0.5b').artifact_file, 'worker-smoke-older.json');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('minMtime restricts the result set to the current batch artifact', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-result-store-min-'));
  try {
    const older = new Date('2026-01-01T00:00:00Z');
    const newer = new Date('2026-01-01T00:01:00Z');
    write(dir, 'worker-smoke-older.json', [{ model: 'qwen2.5:0.5b', ok: true }], older);
    write(dir, 'worker-smoke-newer.json', [{ model: 'llama3.2:1b', ok: true }], newer);
    const latest = latestWorkerResults(dir, newer.getTime());
    assert.equal(latest.file, 'worker-smoke-newer.json');
    assert.deepEqual(latest.results.map(x => x.model), ['llama3.2:1b']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy single-object JSON artifacts are normalized to one result row', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-result-store-legacy-'));
  try {
    write(dir, 'worker-smoke-legacy.json', { model: 'llama3.2:1b', ok: true }, new Date());
    const latest = latestWorkerResults(dir);
    assert.equal(latest.results.length, 1);
    assert.equal(latest.results[0].model, 'llama3.2:1b');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
