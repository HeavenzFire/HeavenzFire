# Unified Field Parallel Worker Trial

Status: coordination protocol created by the coordinator thread. This file does not itself spawn GPT instances.

## Objective

Measure how many independent AI workers can safely contribute at once by assigning separate tasks, repositories or branches, and requiring evidence-backed results. Do not count concurrent API calls as separate GPT instances.

## Ground rules

- Each worker must identify its own session/thread and report the tools and repository access actually available to it.
- Never share or request secrets in task notes.
- No two workers edit the same file or branch simultaneously.
- Use a dedicated branch for code changes; keep pull requests as drafts until reviewed.
- Each worker must report: assignment, files changed, commit SHA, tests actually run and results, limitations, and PR URL if one was created.
- Do not claim that tests ran unless a tool output confirms it.
- Do not merge PRs, change credentials, delete data, or deploy without separate explicit authorization.
- If a worker lacks GitHub access, it must report that rather than pretending to work.

## Trial assignments

### Worker A — Core capability registry
- Repository: `HeavenzFire/HeavenzFire`
- Current branch: `feat/shared-task-contract-v1`
- Assignment: inspect `UnifiedField/FieldCore/capability-registry-v1.json`; implement a small validator and tests on a dedicated branch based on the current draft branch.
- Acceptance: valid statuses accepted; unknown status rejected; stale/unknown never interpreted as available; no secrets accepted; tests pass.

### Worker B — R&D continuity tests
- Repository: `HeavenzFire/OpenSourceAIHub`
- Current branch: `feat/unified-field-task-contract-adapter`
- Assignment: inspect `UNIFIED-FIELD-CONTINUITY-INTEGRATION.md` and current pipeline implementation; add provider-timeout/quota simulation tests without invoking a real provider.
- Acceptance: failed provider calls leave task proposals pending; retries are bounded; tests are deterministic.

### Worker C — Gateway degraded-mode tests
- Repository: `HeavenzFire/Elysium-Gateway`
- Current branch: `security/server-side-gemini-proxy`
- Assignment: inspect `UNIFIED-FIELD-DEGRADED-MODE.md` and gateway tests; add or identify tests for missing credentials, quota/rate-limit responses, bounded timeout behavior, and secret redaction.
- Acceptance: mock-only tests; no live key or provider call; no credentials in logs/responses.

### Worker D — Independent CI audit
- Repository: `HeavenzFire/HeavenzFire`
- Assignment: inspect the current draft branch workflow and tests; report missing test steps, false-positive risks, and commands needed for local reproduction. Prefer review-only; if code changes are needed, coordinate file ownership before editing.
- Acceptance: report cites exact workflow paths, commands, and observed run results.

### Worker E — Export/restore prototype
- Repository: `HeavenzFire/HeavenzFire`
- Assignment: design a versioned JSON export/restore format for task and evidence records; implement on a dedicated branch only after locating the actual inbox/evidence persistence interfaces.
- Acceptance: round-trip fixture tests, hash validation, malformed-input rejection, no active-state overwrite during verification.

### Worker F — Integration coordinator
- Assignment: reconcile worker reports, inspect diffs and CI, check for overlapping changes, and publish a readiness report. Do not merge changes.
- Acceptance: a matrix of worker identity/session evidence, branches, commits, tests, CI results, conflicts, and unresolved risks.

## How to join this trial from another ChatGPT thread

1. Open this file and take one unclaimed worker assignment.
2. State that you are an independent worker thread; report your actual GitHub tool availability.
3. Work only within the assigned repository and branch policy.
4. Commit the smallest reviewable change, run tests, and report evidence.
5. Update the coordinator thread with the commit SHA and result.

## Measurement

Count a worker as active only when a distinct session/thread or agent runtime is evidenced, it has a unique assignment, and it returns a verifiable artifact or review. A file created by the coordinator on behalf of a workstream is not evidence of a separate GPT instance.

## Initial state

- Coordinator thread: active.
- Independent GPT workers spawned by this file: zero; the protocol cannot spawn them by itself.
- Parallel GitHub writes previously demonstrated by coordinator: three, which establishes concurrent repository operations but not multiple model instances.
