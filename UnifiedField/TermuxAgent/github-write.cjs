'use strict';

// Explicitly opt-in GitHub write client for HeavenzFire Termux.
// Writes are limited to non-default feature branches; merges are not implemented.
const API = 'https://api.github.com';
const USER_AGENT = 'HeavenzFire-Termux-Agent';

function validateRepo(repo) {
  if (typeof repo !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error('Repository must use owner/name format');
  }
  return repo;
}

function validateBranch(branch, defaultBranch) {
  if (typeof branch !== 'string' || !/^(?:hf-agent|feat|fix|work)\/[A-Za-z0-9._/-]+$/.test(branch) ||
      branch.includes('..') || branch.endsWith('/') || branch.includes('//')) {
    throw new Error('Write branch must be a safe hf-agent/, feat/, fix/, or work/ branch');
  }
  if (branch === defaultBranch) throw new Error('Refusing to write to the repository default branch');
  return branch;
}

function enabled(options) {
  const token = options?.token ?? process.env.HF_GITHUB_TOKEN;
  if (!token) throw new Error('Missing HF_GITHUB_TOKEN');
  const writeEnabled = options?.writeEnabled ?? process.env.HF_GITHUB_WRITE === '1';
  if (!writeEnabled) throw new Error('GitHub writes are disabled. Set HF_GITHUB_WRITE=1 to explicitly enable branch/PR writes.');
  return { token, fetchImpl: options?.fetchImpl ?? fetch };
}

async function request(method, path, body, options = {}) {
  const { token, fetchImpl } = enabled(options);
  if (!path.startsWith('/repos/') || path.includes('..') || path.includes('\\')) throw new Error('Invalid GitHub API path');
  const response = await fetchImpl(API + path, {
    method,
    redirect: 'error',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      'user-agent': USER_AGENT
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 20000)
  });
  const text = await response.text();
  if (text.length > 1_000_000) throw new Error('GitHub response exceeded 1 MB safety limit');
  let data = {};
  if (text) { try { data = JSON.parse(text); } catch { throw new Error('GitHub returned invalid JSON'); } }
  if (!response.ok) {
    const error = new Error('GitHub API HTTP ' + response.status + (data.message ? ': ' + data.message : ''));
    error.status = response.status;
    throw error;
  }
  return data;
}

const repoPath = repo => '/repos/' + validateRepo(repo);

async function getRepo(repo, options) {
  return request('GET', repoPath(repo), undefined, options);
}

async function createFeatureBranch(repo, branch, options = {}) {
  const repository = await getRepo(repo, options);
  validateBranch(branch, repository.default_branch);
  const head = await request('GET', repoPath(repo) + '/git/ref/heads/' + encodeURIComponent(repository.default_branch), undefined, options);
  const result = await request('POST', repoPath(repo) + '/git/refs', {
    ref: 'refs/heads/' + branch,
    sha: head.object.sha
  }, options);
  return { branch, base: repository.default_branch, sha: result.object?.sha ?? head.object.sha };
}

async function writeFile(repo, branch, filePath, content, message, options = {}) {
  if (typeof filePath !== 'string' || !filePath || filePath.startsWith('/') ||
      filePath.split('/').includes('..') || filePath.includes('\\')) {
    throw new Error('File path must be a safe relative repository path');
  }
  if (typeof content !== 'string' || typeof message !== 'string' || !message.trim()) {
    throw new Error('content and a non-empty commit message are required');
  }
  const repository = await getRepo(repo, options);
  validateBranch(branch, repository.default_branch);
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const apiPath = repoPath(repo) + '/contents/' + encodedPath;
  let sha;
  try {
    const existing = await request('GET', apiPath + '?ref=' + encodeURIComponent(branch), undefined, options);
    sha = existing.sha;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  const result = await request('PUT', apiPath, {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
    ...(sha ? { sha } : {})
  }, options);
  return { path: filePath, branch, commit_sha: result.commit?.sha, content_sha: result.content?.sha };
}

async function openPullRequest(repo, branch, title, body, options = {}) {
  const repository = await getRepo(repo, options);
  validateBranch(branch, repository.default_branch);
  if (typeof title !== 'string' || !title.trim()) throw new Error('PR title is required');
  const result = await request('POST', repoPath(repo) + '/pulls', {
    title, body: String(body || ''),
    head: branch, base: repository.default_branch, draft: true
  }, options);
  return { number: result.number, url: result.html_url, state: result.state, draft: result.draft };
}

module.exports = { validateRepo, validateBranch, createFeatureBranch, writeFile, openPullRequest };
