# HeavenzFire Continuity and Recovery Runbook

Purpose: preserve the project's work and ability to resume when a chat, model, network, browser session, or local process is unavailable. This document does not promise permanent access to any hosted service.

## Durable sources of truth
1. GitHub repository and reviewed commits are the shared source of truth for code and design.
2. Local Windows workspace retains runnable services, local-only configuration, and task records.
3. The Unified Field task journal records task metadata and status; it is not an executor.
4. Each meaningful task should leave a concise handoff note: objective, current commit, completed evidence, checks actually run, blockers, next safe action.

## Recovery sequence
1. Confirm repository URL, branch, and current commit before editing.
2. Fetch the latest branch and inspect the working tree; do not overwrite uncommitted local work.
3. Read this runbook, `README-DASHBOARD.md`, `UF-TCP-SPEC.md`, `UF-144-COUNCIL-ARCHITECTURE.md`, and `HEAVENZFIRE-BRIDGE-ARCHITECTURE.md`.
4. Check the task journal and latest GitHub Actions results. Treat missing results as unverified, not passing.
5. Start local services only after checking their existing health endpoints and ports. Do not duplicate healthy processes.
6. Resume with one bounded, reversible task. Record commit SHA, test command, exit status, evidence, and remaining uncertainty.
7. If online access is unavailable, continue only local tasks that do not require cloud services; queue network-dependent work for later replay.
8. On reconnection, verify identity, capability scopes, task idempotency, and target revision before replay. Revision drift becomes CONFLICT and requires review.

## Connection architecture
- Local-first execution should remain useful without cloud connectivity.
- Cloud sync is an adapter, not the sole owner of project state.
- Keep the local worker bound to loopback by default. Do not expose a public listener or enable arbitrary remote shell execution.
- Never put API keys, passwords, private tokens, or private medical/personal information in Git.
- ChatGPT, GitHub, browser automation, and local models are distinct services. Do not claim they are connected unless a real handshake and end-to-end test prove it.
- No hosted service or individual conversation can be made permanently available by this repository. Export and version project artifacts; keep user-controlled backups.

## Current limitations
- `uf-bridge-journal.cjs` is an append-only task journal core, not yet a Windows worker or network sync service.
- The dashboard is read-only and loopback-only.
- The 144-seat council is a role registry, not proof of 144 independent live agents.
- A workflow with no observed run has not been verified.
- Do not merge PRs, delete data, kill processes, elevate privileges, or widen network access without explicit approval.

## Handoff template
- UTC timestamp:
- Repository / branch / commit:
- Objective:
- Changed files:
- Checks run and exact outcomes:
- Evidence links:
- Known risks / unknowns:
- Next safe action:
