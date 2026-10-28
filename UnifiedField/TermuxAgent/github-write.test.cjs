'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRepo, validateBranch, createFeatureBranch, writeFile, openPullRequest } = require('./github-write.cjs');

test('writes only to explicitly named feature branches', () => {
  assert.equal(validateRepo('HeavenzFire/HeavenzFire'), 'HeavenzFire/HeavenzFire');
  assert.equal(validateBranch('hf-agent/orchestration', 'main'), 'hf-agent/orchestration');
  assert.throws(() => validateBranch('main', 'main'), /default branch/);
  assert.throws(() => validateBranch('../main', 'main'));
  assert.throws(() => validateBranch('random-branch', 'main'));
});

test('write operations require token and explicit opt-in', async () => {
  await assert.rejects(createFeatureBranch('HeavenzFire/HeavenzFire', 'hf-agent/test', { token: 'x', writeEnabled: false }), /writes are disabled/i);
  await assert.rejects(createFeatureBranch('HeavenzFire/HeavenzFire', 'hf-agent/test', { token: '' }), /Missing HF_GITHUB_TOKEN/);
});

test('creates a branch from default head', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    if (url.endsWith('/repos/HeavenzFire/HeavenzFire')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ default_branch: 'main' }) };
    }
    if (url.endsWith('/git/ref/heads/main')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ object: { sha: 'abc123' } }) };
    }
    return { ok: true, status: 201, text: async () => JSON.stringify({ object: { sha: 'abc123' } }) };
  };
  const out = await createFeatureBranch('HeavenzFire/HeavenzFire', 'hf-agent/test', { token: 'x', writeEnabled: true, fetchImpl });
  assert.equal(out.sha, 'abc123');
  assert.equal(calls.at(-1).body.ref, 'refs/heads/hf-agent/test');
  assert.equal(calls.at(-1).body.sha, 'abc123');
});

test('commits a file to a feature branch and opens a draft PR', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) });
    if (init.method === 'GET' && url.endsWith('/repos/HeavenzFire/HeavenzFire')) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ default_branch: 'main' }) };
    }
    if (init.method === 'GET' && url.includes('/contents/')) {
      return { ok: false, status: 404, text: async () => '{"message":"Not Found"}' };
    }
    if (init.method === 'PUT') {
      return { ok: true, status: 201, text: async () => JSON.stringify({ commit: { sha: 'commit1' }, content: { sha: 'blob1' } }) };
    }
    return { ok: true, status: 201, text: async () => JSON.stringify({ number: 120, html_url: 'https://github.com/HeavenzFire/HeavenzFire/pull/120', state: 'open', draft: true }) };
  };
  const opts = { token: 'x', writeEnabled: true, fetchImpl };
  const file = await writeFile('HeavenzFire/HeavenzFire', 'hf-agent/test', 'test.txt', 'hello', 'test commit', opts);
  assert.equal(file.commit_sha, 'commit1');
  const pr = await openPullRequest('HeavenzFire/HeavenzFire', 'hf-agent/test', 'Test PR', 'Evidence', opts);
  assert.equal(pr.number, 120);
  assert.equal(pr.draft, true);
  assert.ok(calls.some(x => x.method === 'PUT'));
  assert.ok(calls.some(x => x.method === 'POST' && x.url.endsWith('/pulls')));
});
