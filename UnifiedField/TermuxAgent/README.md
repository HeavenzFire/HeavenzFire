# HeavenzFire Termux Local Agent

A dependency-free Node.js CLI for local inference, bounded local multi-agent fan-out, and an opt-in GitHub bridge. Inference is restricted to loopback; the local agent and orchestrator have no shell tools.

## Local inference

Start llama.cpp in one Termux session with a real GGUF path:

```sh
./build/bin/llama-server -m "$HOME/models/your-model.gguf" --host 127.0.0.1 --port 8080 -c 2048
```

In another session:

```sh
node UnifiedField/TermuxAgent/agent.cjs
```

Set `HF_LOCAL_ENDPOINT` and `HF_LOCAL_MODEL` when needed. Interactive commands: `:help`, `:reset`, `:quit`.

## Bounded local orchestration

Create a JSON plan. Each task is a separate prompt to the configured local model; concurrency is capped at 16. Results and individual failures are written to a JSON evidence report. This is parallel prompt orchestration, not independent models, shell execution, or proof that model answers are correct.

```json
{
  "parallelism": 4,
  "tasks": [
    { "id": "repo-risk-review", "prompt": "Review the supplied design for security risks. State assumptions and tests needed." },
    { "id": "test-plan", "prompt": "Propose focused regression tests for the design. Separate required tests from optional tests." },
    { "id": "integration-map", "prompt": "Identify interfaces and dependencies needed to integrate this component." }
  ]
}
```

Save that as `plan.json` in the repository root, then run:

```sh
node UnifiedField/TermuxAgent/orchestrate.cjs plan.json artifacts/local-orchestration-run.json
```

The run rejects non-loopback endpoints, duplicate/invalid task IDs, oversized plans, and concurrency outside 1–16. The report records a run ID, model label, endpoint, per-task status, durations, answers or errors, and summary counts. Treat generated output as untrusted analysis; review it before using it to modify code.

## GitHub connection

GitHub access is separate from local inference. Set a fine-grained token only in the current Termux shell; never paste it into chat, commit it, or put it in a script. Grant only the required repository permissions.

```sh
export HF_GITHUB_TOKEN='YOUR_TOKEN_IN_THIS_TERMUX_SESSION'
node UnifiedField/TermuxAgent/github-cli.cjs repo HeavenzFire/HeavenzFire
node UnifiedField/TermuxAgent/github-cli.cjs issues HeavenzFire/HeavenzFire
node UnifiedField/TermuxAgent/github-cli.cjs prs HeavenzFire/HeavenzFire
```

Writes require the separate explicit opt-in `HF_GITHUB_WRITE=1` and are limited to non-default feature branches. There is no merge command. Review diffs and CI before approving a pull request.

## Validation

```sh
bash UnifiedField/TermuxAgent/verify-termux.sh
```

This checks Node.js 18+, syntax-checks the modules, and runs the agent, GitHub bridge, and orchestration test suites. For a live inference smoke test, start the local server, set the correct `HF_LOCAL_ENDPOINT` and `HF_LOCAL_MODEL`, then run:

```sh
HF_LOCAL_SMOKE=1 bash UnifiedField/TermuxAgent/verify-termux.sh
```

## Files and boundaries

- `agent.cjs`: interactive local chat; no shell tools.
- `orchestrate.cjs`: bounded parallel local prompt runner; no shell or GitHub write access.
- `github.cjs`: read-only GitHub API client.
- `github-write.cjs` / `github-cli.cjs`: explicit-opt-in branch-scoped GitHub writes.
- `*.test.cjs`: deterministic unit tests using mocked endpoints.

Automated tests are not a substitute for an on-device live inference run. Parallel prompts to one model are not the same as a multi-model agent team, distributed consensus, or validated autonomous software engineering.
