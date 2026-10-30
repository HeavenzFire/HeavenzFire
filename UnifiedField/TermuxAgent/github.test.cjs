'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRepo, validatePath, githubGet, listIssues, listPullRequests } = require('./github.cjs');

test('validates repository and read-only API path allowlist', () => {
  assert.equal(validateRepo('HeavenzFire/HeavenzFire'), 'HeavenzFire/HeavenzFire');
  assert.throws(() => validateRepo('../other'));
  assert.equal(validatePath('/repos/HeavenzFire/HeavenzFire/issues?state=open'), '/repos/HeavenzFire/HeavenzFire/issues?state=open');
  assert.throws(() => validatePath('/repos/HeavenzFire/HeavenzFire/actions/workflows'));
  assert.throws(() => validatePath('/repos/HeavenzFire/HeavenzFire/../../settings'));
});

test('requires token and never makes write requests', async () => {
  await assert.rejects(githubGet('/repos/HeavenzFire/HeavenzFire', { token: '' }), /Missing HF_GITHUB_TOKEN/);
  let request;
  const result = await githubGet('/repos/HeavenzFire/HeavenzFire', {
    token: 'test-token',
    fetchImpl: async (url, init) => {
      request = { url, init };
      return { ok: true, status: 200, text: async () => '{"full_name":"HeavenzFire/HeavenzFire"}' };
    }
  });
  assert.equal(result.full_name, 'HeavenzFire/HeavenzFire');
  assert.equal(request.init.method, 'GET');
  assert.equal(request.init.redirect, 'error');
  assert.equal(request.init.headers.authorization, 'Bearer test-token');
});

test('reports API errors without printing token', async () => {
  await assert.rejects(githubGet('/repos/HeavenzFire/HeavenzFire', {
    token: 'secret-do-not-print',
    fetchImpl: async () => ({ ok: false, status: 404, text: async () => '{"message":"Not Found"}' })
  }), error => error.message === 'GitHub API HTTP 404');
});

test('issue and PR listing constrain state and return data', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method });
    return { ok: true, status: 200, text: async () => '[]' };
  };
  await listIssues('HeavenzFire/HeavenzFire', { token: 'x', fetchImpl });
  await listPullRequests('HeavenzFire/HeavenzFire', { token: 'x', fetchImpl, state: 'all' });
  assert.match(calls[0].url, /issues\?state=open/);
  assert.match(calls[1].url, /pulls\?state=all/);
  assert.ok(calls.every(x => x.method === 'GET'));
  await assert.rejects(listIssues('HeavenzFire/HeavenzFire', { token: 'x', state: 'write' }), /state must be/);
});
