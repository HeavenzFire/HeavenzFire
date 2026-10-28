'use strict';

// Read-only GitHub REST client for the HeavenzFire Termux agent.
// Credentials are read from HF_GITHUB_TOKEN at runtime and must never be committed.
const API = 'https://api.github.com';
const MAX_RESPONSE_BYTES = 1_000_000;

function validateRepo(repo) {
  if (typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error('Repository must use owner/name format');
  }
  return repo;
}

function validatePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/repos/') ||
      path.includes('..') || path.includes('\\') || path.includes('#')) {
    throw new Error('Only safe GitHub repository API paths are allowed');
  }
  const allowed = /^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/(?:issues|pulls|commits|contents)(?:\/[^?]*)?)?(?:\?.*)?$/;
  if (!allowed.test(path)) throw new Error('Endpoint is not in the read-only allowlist');
  return path;
}

async function githubGet(path, options = {}) {
  const token = options.token ?? process.env.HF_GITHUB_TOKEN;
  if (!token) throw new Error('Missing HF_GITHUB_TOKEN; authenticate without putting a token in source code');
  const safePath = validatePath(path);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(API + safePath, {
    method: 'GET',
    redirect: 'error',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: 'Bearer ' + token,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'HeavenzFire-Termux-Agent'
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 15000)
  });
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error('GitHub response exceeded the 1 MB safety limit');
  if (!response.ok) {
    const error = new Error('GitHub API HTTP ' + response.status);
    error.status = response.status;
    if (response.status === 401 || response.status === 403) {
      error.message += '; check token validity, scopes, and API rate limits';
    }
    throw error;
  }
  try { return JSON.parse(text); }
  catch { throw new Error('GitHub returned invalid JSON'); }
}

function repoPath(repo, suffix = '') {
  return '/repos/' + validateRepo(repo) + suffix;
}

async function getRepository(repo, options) {
  return githubGet(repoPath(repo), options);
}

async function listIssues(repo, options) {
  const state = options?.state ?? 'open';
  if (!['open', 'closed', 'all'].includes(state)) throw new Error('state must be open, closed, or all');
  return githubGet(repoPath(repo, '/issues?state=' + state + '&per_page=30'), options);
}

async function listPullRequests(repo, options) {
  const state = options?.state ?? 'open';
  if (!['open', 'closed', 'all'].includes(state)) throw new Error('state must be open, closed, or all');
  return githubGet(repoPath(repo, '/pulls?state=' + state + '&per_page=30'), options);
}

async function listCommits(repo, options) {
  return githubGet(repoPath(repo, '/commits?per_page=20'), options);
}

async function getFile(repo, path, options) {
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.split('/').includes('..')) {
    throw new Error('File path must be a relative repository path');
  }
  return githubGet(repoPath(repo, '/contents/' + path.split('/').map(encodeURIComponent).join('/')), options);
}

module.exports = {
  API, validateRepo, validatePath, githubGet,
  getRepository, listIssues, listPullRequests, listCommits, getFile
};
