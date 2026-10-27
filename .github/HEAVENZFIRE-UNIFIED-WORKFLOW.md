# HeavenzFire Unified Field — Shared Workflow Contract

Status: working agreement for contributors, agents, and review threads.
Scope: engineering work in this repository and connected Unified Field components.

## Single source of truth

- Repository issues/PRs, commits, workflow logs, and reproducible test output are authoritative.
- Before editing, inspect the current branch, relevant files, open PRs, and latest checks. Do not rely on stale summaries.
- Record handoffs in the relevant issue/PR or task ledger. A chat message alone is not a durable task record.
- Never claim a separate agent/thread ran, agreed, or completed work unless its result is observable and linked.

## Four workflow roles

These are review roles, not a claim that four separate model processes are running. If independent agents are available, assign roles explicitly; otherwise perform the passes sequentially and record each handoff.

### 1. Architect
Record the objective, current-state evidence, affected interfaces/dependencies, threat model, acceptance criteria, and smallest reversible change.

### 2. Builder
Make one scoped change at a time. Reuse existing code and conventions. Add regression tests with behavior changes. Keep unrelated cleanup out of the patch.

### 3. Adversarial verifier
Independently inspect the diff and challenge assumptions. Check authorization boundaries, input validation, replay/concurrency, persistence/restart behavior, failure paths, secrets, injection, data loss, network exposure, regressions, and whether tests actually ran. Report findings by severity; disagreement is allowed.

### 4. Integrator
Reconcile findings explicitly, run the relevant tests, inspect exact workflow logs, check cross-component interactions, document rollback, and identify the next dependency-aware task. Do not convert a green narrow test into a broad production-readiness claim.

## Handoff record (required per task)

- **Task / owner:** one accountable owner; collaborators and review roles named where known.
- **Architect:** requirements, evidence, dependencies, acceptance criteria.
- **Builder:** changed paths, commit SHA, behavior change, and test additions.
- **Verifier:** findings (blocker/high/medium/low), tests inspected, unresolved questions.
- **Integrator:** accepted/rejected findings with reasons, exact checks and outcomes, rollback, next task.
- **State:** blocked / in progress / ready for review / verified. “Verified” must cite reproducible evidence.

## Safety and release gates

- Fail closed if authorization, configuration, identity, or input binding is absent or ambiguous.
- Never commit credentials, tokens, private keys, or sensitive user data.
- No destructive operations, security relaxation, public network exposure, or privileged execution without explicit authorization and a documented rollback path.
- Do not merge a draft or a change with unresolved high-severity findings. Do not merge merely because CI is green; verify that relevant tests are included in the workflow and appear in logs.
- Separate automated CI evidence from local Windows/Ollama end-to-end evidence. Never claim the latter unless it was actually run.
- Preserve user changes and make minimal, reversible commits.

## Definition of done

A task is done only when:
1. acceptance criteria are explicit and met;
2. relevant regression tests are wired into the intended CI workflow;
3. the exact commit's checks and logs have been inspected;
4. the adversarial review has no unresolved blocker/high-severity finding;
5. remaining limitations, rollback, and next step are recorded.

## Current priority queue (revalidate before acting)

1. Keep PR #104 open and fail-closed while its approval lifecycle remains incomplete.
2. Implement and adversarially test approval binding to request ID, action, and canonical exact input; expiry; and durable, atomic one-time consumption safe across restart and concurrent requests.
3. Investigate the `planetary-mesh-global` submodule metadata warning; do not invent a remote URL.
4. Inspect whether `main` has required status checks/branch protection and report observed settings before changing them.
5. Run a local Windows/Ollama end-to-end test only when the authorized local bridge is available and verified.

This queue is a snapshot, not permission to perform high-risk changes. Recheck current repository state before executing it.
