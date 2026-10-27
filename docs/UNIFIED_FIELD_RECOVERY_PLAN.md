# Unified Field Recovery Plan

**Status:** evidence-scoped recovery plan; not a claim that local services are online  
**Updated:** 2026-10-27  
**Repository:** `HeavenzFire/HeavenzFire`

## What already exists in the repository

The first inspection found useful implementation work already on `main`; do not rebuild these primitives from scratch:

- `UnifiedField/QuantumLab/uf-bridge-journal.cjs`: append-only JSONL task journal, idempotency, state transitions, restart reconstruction, corrupt-line fail-closed behavior, and target-commit replay checks.
- `UnifiedField/QuantumLab/uf-bridge-journal.test.cjs`: deterministic tests for those journal behaviors.
- `UnifiedField/QuantumLab/uf-local-worker.cjs`: loopback-only HTTP API with bearer-protected task routes, task journaling, and a limited fixed-action execution route.
- `UnifiedField/QuantumLab/uf-local-worker.test.cjs`: tests for auth, idempotent enqueue, restart recovery, corrupt journals, route rejection, and execution allowlisting.
- `UnifiedField/QuantumLab/Start-UnifiedFieldWorker.ps1`: existing PowerShell launcher.
- `UnifiedField/QuantumLab/Start-UnifiedFieldDashboard.ps1` and `UnifiedField-Dashboard-Server.cjs`: existing dashboard launch and service aggregation.
- `UnifiedField/QuantumLab/README-DASHBOARD.md`: documents the current boundary: queue metadata is not automatic dispatch, the dashboard does not execute the full offline journal, and configured roles are not proof of live independent agents.

These are repository-source findings, not fresh execution results. The source and tests were inspected through GitHub; they have not been executed on the user's Windows machine in this session.

## Current known blockers

- A recent phone-side request to `http://100.70.89.89:11434/api/tags` failed with connection refused/unreachable. This does not establish whether Ollama is healthy on Windows loopback.
- The local worker has an authenticated `/api/handshake` endpoint with protocol-version checking, worker identity, client nonce validation, and in-memory replay rejection. It still explicitly reports no network sync, no automatic replay, and no live mesh; a handshake is not an end-to-end remote task bridge.
- A local dashboard health response would not prove the worker, phone, or Ollama are reachable across Tailscale.
- Existing dashboard/worker launch scripts and the queue must be inspected and tested before creating replacement launchers or new services.

## Recommended workaround architecture

Keep one stable task contract and make transports replaceable:

1. **Local-first core:** journal and worker continue operating without internet, GitHub, Tailscale, or a browser adapter.
2. **GitHub adapter:** use the authorized connector for repository work while online; preserve offline task records and only mark them complete after result evidence exists.
3. **Transport adapters:** Tailscale is one transport, not the protocol. Local loopback mode and explicit export/import must remain available.
4. **Task execution:** typed, named operations only. Never turn model-generated text into arbitrary shell commands.
5. **Reconnect:** reuse the existing worker handshake; implement and test a client-side handshake verifier and a bounded authenticated transport adapter. Preserve task-ID/idempotency checks, re-check target commit SHA, and log conflicts instead of overwriting.
6. **Status UI:** distinguish `CONNECTED`, `DEGRADED`, `OFFLINE`, and `NOT_CONFIGURED`; stale heartbeat means unknown/offline, never connected.
7. **Security:** loopback binding by default, bearer secrets outside Git, explicit approval for privileged/destructive operations, network exposure, service restarts, deployments, and merges.

## Recovery sequence

1. **Repository truth:** inventory open PRs, CI results, current branch heads, and the existing dashboard/worker code before choosing a patch.
2. **Local truth:** on Windows, inspect process ownership, listener bindings, and health endpoints for dashboard, worker, Ollama, and mesh bridge separately.
3. **Classify the failed phone request:** confirm current Windows Tailscale IP; test Ollama on `127.0.0.1:11434`; then test from Windows to its own tailnet IP; then test from Android. This separates app failure, loopback-only binding, peer/network/ACL failure, and wrong IP.
4. **Restore local service first:** keep the worker and queue functional with Tailscale disconnected.
5. **Restore remote path:** verify one bounded authenticated end-to-end request and response before declaring connected.
6. **Regression test:** duplicate task replay, worker restart, stale commit, malformed input, corrupt journal, missing/wrong bearer token, unreachable peer, and unsupported operation must fail safely.
7. **Record evidence:** commit SHA, exact command, expected/actual output, UTC timestamp, and blockers. Do not treat source inspection or endpoint health as a successful task execution.

## Acceptance gates

- [ ] Existing journal and worker test suites run on the target Node.js version and pass.
- [ ] Existing PowerShell 5.1 launcher starts the worker and validates its health endpoint.
- [x] Worker-side handshake reports protocol version, worker identity, capabilities, and echoes a validated client nonce; version mismatch and nonce replay are rejected in the existing worker tests.
- [ ] Client-side handshake verification and a real authenticated cross-device request/response are tested end to end; the worker remains loopback-only by default.
- [ ] Local journal and dashboard continue to work with internet and Tailscale unavailable.
- [ ] Remote task exchange works end-to-end over the chosen transport, with authentication and idempotency.
- [ ] A changed target commit blocks replay until evidence is refreshed.
- [ ] Privileged/destructive/external operations remain approval-gated.
- [ ] GitHub Actions results are inspected on the exact proposed head before merging.

## Next implementation slice

Do not add a second journal, duplicate handshake, or replacement dashboard. The source-path status command is now merged in `unified-field/uf.mjs`; it checks declared local component paths but does not claim runtime health. Next, add a client-side handshake verifier and a bounded transport adapter behind explicit configuration, with tests for wrong tokens, protocol mismatch, nonce replay, timeout, duplicate task delivery, stale target commits, and unavailable peers. Keep the existing worker loopback-only until the transport's authentication, authorization, and rollback behavior are independently tested. A production approval verifier with expiry and durable one-time consumption remains a separate blocker for any execution path.
