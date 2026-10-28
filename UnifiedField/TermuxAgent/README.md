# HeavenzFire Termux Local Agent

A dependency-free Node.js CLI for local inference and an opt-in GitHub bridge. The local model endpoint remains loopback-only; GitHub access is a separate explicit capability and never falls back to cloud inference.

## Local inference

For llama.cpp, start the server in one Termux session using a real GGUF path:

```sh
./build/bin/llama-server -m "$HOME/models/your-model.gguf" --host 127.0.0.1 --port 8080 -c 2048
```

In another session:

```sh
node UnifiedField/TermuxAgent/agent.cjs
```

Set `HF_LOCAL_ENDPOINT` and `HF_LOCAL_MODEL` if your server uses different values. Commands: `:help`, `:reset`, `:quit`.

## GitHub connection

The GitHub bridge is separate from local inference. It uses Node.js built-in `fetch`; no package install is required. Set a GitHub fine-grained personal access token in the current Termux shell. Grant only the needed repository access and permissions: **Contents: read/write** and **Pull requests: read/write** for the selected repository. Issues: read-only is sufficient for issue listing. Never paste the token into chat, commit it, or put it in a script.

```sh
export HF_GITHUB_TOKEN='YOUR_TOKEN_IN_THIS_TERMUX_SESSION'
node UnifiedField/TermuxAgent/github-cli.cjs repo HeavenzFire/HeavenzFire
node UnifiedField/TermuxAgent/github-cli.cjs issues HeavenzFire/HeavenzFire
node UnifiedField/TermuxAgent/github-cli.cjs prs HeavenzFire/HeavenzFire
```

Writes require a second explicit switch and are restricted to feature branches; there is no merge command:

```sh
export HF_GITHUB_WRITE=1
node UnifiedField/TermuxAgent/github-cli.cjs branch HeavenzFire/HeavenzFire hf-agent/orchestration
# Commit a local file to that branch:
node UnifiedField/TermuxAgent/github-cli.cjs write HeavenzFire/HeavenzFire hf-agent/orchestration UnifiedField/TermuxAgent/example.md ./example.md "Add example"
# Open a draft PR from that branch (body is read from a local Markdown file):
node UnifiedField/TermuxAgent/github-cli.cjs pr HeavenzFire/HeavenzFire hf-agent/orchestration "HeavenzFire orchestration update" ./pr-body.md
```

The bridge creates commits and draft PRs on a non-default branch. It does not merge PRs, change repository settings, or run arbitrary shell commands. Inspect the branch diff and CI results before approving or merging. The write client validates repository/branch inputs and never logs the token.

## Files

- `agent.cjs`: interactive local model chat, no shell tools.
- `github.cjs`: read-only GitHub API client.
- `github-write.cjs`: explicit-opt-in branch-scoped file/PR writes.
- `github-cli.cjs`: command-line interface to those GitHub operations.

## Tests

```sh
node --check UnifiedField/TermuxAgent/agent.cjs
node --check UnifiedField/TermuxAgent/github.cjs
node --check UnifiedField/TermuxAgent/github-write.cjs
node --check UnifiedField/TermuxAgent/github-cli.cjs
node --test UnifiedField/TermuxAgent/agent.test.cjs
node --test UnifiedField/TermuxAgent/github.test.cjs
node --test UnifiedField/TermuxAgent/github-write.test.cjs
```

## Boundaries

Local inference prompts are sent only to the configured loopback inference server. GitHub requests use the official GitHub API over HTTPS when explicitly invoked. The GitHub bridge is write-capable only after the user sets `HF_GITHUB_WRITE=1`; its default is read-only. These are separate execution paths: GitHub connectivity does not itself prove autonomous multi-agent orchestration or validate model output.
