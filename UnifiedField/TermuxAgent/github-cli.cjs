'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const gh = require('./github-write.cjs');

function usage() {
  console.log(`HeavenzFire GitHub bridge (Termux)
Requires HF_GITHUB_TOKEN and HF_GITHUB_WRITE=1 for writes.

Read:
  node github-cli.cjs repo <owner/name>
  node github-cli.cjs issues <owner/name> [open|closed|all]
  node github-cli.cjs prs <owner/name> [open|closed|all]
  node github-cli.cjs commits <owner/name>

Write (always uses a non-default feature branch):
  node github-cli.cjs branch <owner/name> <hf-agent/branch-name>
  node github-cli.cjs write <owner/name> <branch> <repo/path> <local-file> <commit-message>
  node github-cli.cjs pr <owner/name> <branch> <title> <body-file>

No merge command exists. Review and merge pull requests on GitHub after inspecting the diff and checks.`);
}

async function main(argv) {
  const [cmd, repo, ...args] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help') return usage();
  if (!repo) throw new Error('Repository argument is required');
  const token = process.env.HF_GITHUB_TOKEN;
  if (!token) throw new Error('Set HF_GITHUB_TOKEN in this Termux session; do not put it in source files.');
  const opts = { token };
  if (['branch', 'write', 'pr'].includes(cmd)) {
    if (process.env.HF_GITHUB_WRITE !== '1') {
      throw new Error('Write action blocked. Explicitly set HF_GITHUB_WRITE=1 for this session.');
    }
    opts.writeEnabled = true;
  }
  if (cmd === 'repo') {
    const r = await gh.getRepository(repo, opts);
    console.log(JSON.stringify({
      full_name: r.full_name, private: r.private, default_branch: r.default_branch,
      html_url: r.html_url, permissions: r.permissions
    }, null, 2));
    return;
  }
  if (cmd === 'issues' || cmd === 'prs') {
    const state = args[0] || 'open';
    const rows = cmd === 'issues'
      ? await gh.listIssues(repo, { ...opts, state })
      : await gh.listPullRequests(repo, { ...opts, state });
    console.log(JSON.stringify(rows.map(x => ({
      number: x.number, title: x.title, state: x.state, html_url: x.html_url,
      draft: x.draft, head: x.head?.ref, base: x.base?.ref
    })), null, 2));
    return;
  }
  if (cmd === 'commits') {
    const rows = await gh.listCommits(repo, opts);
    console.log(JSON.stringify(rows.map(x => ({
      sha: x.sha, message: x.commit?.message, url: x.html_url
    })), null, 2));
    return;
  }
  if (cmd === 'branch') {
    const [branch] = args;
    if (!branch) throw new Error('Branch name required, e.g. hf-agent/fix-queue');
    console.log(JSON.stringify(await gh.createFeatureBranch(repo, branch, opts), null, 2));
    return;
  }
  if (cmd === 'write') {
    const [branch, repoPath, localFile, ...messageParts] = args;
    const message = messageParts.join(' ');
    if (!branch || !repoPath || !localFile || !message) throw new Error('Missing branch, repo path, local file, or commit message');
    const resolved = path.resolve(localFile);
    const content = await fs.readFile(resolved, 'utf8');
    console.log(JSON.stringify(await gh.writeFile(repo, branch, repoPath, content, message, opts), null, 2));
    return;
  }
  if (cmd === 'pr') {
    const [branch, title, ...bodyFileParts] = args;
    const bodyFile = bodyFileParts.join(' ');
    if (!branch || !title || !bodyFile) throw new Error('Missing branch, title, or body file');
    const body = await fs.readFile(path.resolve(bodyFile), 'utf8');
    console.log(JSON.stringify(await gh.openPullRequest(repo, branch, title, body, opts), null, 2));
    return;
  }
  usage();
  throw new Error('Unknown command: ' + cmd);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error('GitHub bridge error: ' + String(error.message || error));
    process.exitCode = 1;
  });
}
module.exports = { main, usage };
