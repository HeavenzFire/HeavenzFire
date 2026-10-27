# HeavenzFire Unified Field — Verified Status Ledger

**Updated:** 2026-10-27  
**Purpose:** Shared engineering handoff for parallel contributors. This file distinguishes merged code, CI evidence, local smoke deployment, and work that remains blocked. It is not a claim that the entire mission is complete.

## Mission boundary

Build local-first, auditable systems that reduce coercive extraction of human attention and personal data, preserve user exit rights, and prevent unreviewed automation from becoming another centralized authority.

Success requires usable controls and verifiable behavior. A repository, health endpoint, UI mockup, or green unit test alone does not prove a complete end-to-end system or a societal outcome.

## Integrated components

| Component | Current state | Evidence / boundary |
|---|---|---|
| Capability registry and module catalogue | Merged | Schema/validator tests run in CI; module paths are checked against real repository files. |
| Consent policy gate | Merged | Fail-closed decision helper exists. Callers must explicitly enforce its result; its presence alone does not authorize actions. |
| Health probe | Merged | Loopback default and explicit external-host allowlist; redirects are denied. |
| Shared task contract and local inbox | Merged | Node integration tests cover task validation, idempotency, bounded listing, and persistence. |
| Local worker handshake and client response verifier | Merged | Worker checks bearer authentication, protocol version, client nonce shape/replay, and returns worker identity/capabilities; the loopback client validates the response and is covered by end-to-end CI. |
| Remote proposal transport client | Merged | `uf-remote-task-client.cjs` requires HTTPS and exact hostname allowlisting, verifies the handshake, then lists/queues proposals with bearer authentication, no redirects, and bounded timeouts. Worker accepts an exact configured Serve Host only from a loopback peer. Automated tests passed. Live Tailscale Serve setup and two-device proposal round trip remain unverified. |
| Windows task inbox control | Merged | UnifiedField/Invoke-UnifiedFieldTaskInbox.ps1 provides Start, Status, Submit, Review, and Stop. |
| Read-only review CLI | Merged | Confirms proposals remain proposed/pending; does not approve or execute tasks. |
| Proposal submission CLI | Merged | Validates task IDs and bounded input; reports executionStarted=false. |
| Evidence ledger | Merged | Hash-chained local evidence format; single-writer assumptions remain a documented limitation. |
| BrowserBridge | Merged | Loopback-only adapter submits proposals; real-browser installation/interaction smoke testing remains outstanding. |
| Attention Guard | Merged | Manifest V3, explicit domain blocklist, timed focus sessions, early stop, local storage, and automated policy tests. Manual browser installation/navigation smoke test remains outstanding. |

### Local task inbox commands

Run these from the repository root in PowerShell 5.1+ with Node.js 18 or later:

    # Start
    .\UnifiedField\Invoke-UnifiedFieldTaskInbox.ps1 -Action Start

    # Check status
    .\UnifiedField\Invoke-UnifiedFieldTaskInbox.ps1 -Action Status

    # Submit a proposal (not an execution request)
    .\UnifiedField\Invoke-UnifiedFieldTaskInbox.ps1 -Action Submit -Source 'manual-review' -Goal 'Describe the bounded task here.'

    # Review pending proposals without changing them
    .\UnifiedField\Invoke-UnifiedFieldTaskInbox.ps1 -Action Review

    # Stop only a process owned by the launcher
    .\UnifiedField\Invoke-UnifiedFieldTaskInbox.ps1 -Action Stop

The default runtime data directory is %LOCALAPPDATA%\HeavenzFire\UnifiedFieldRuntime\state, separate from the older HeavenzFire state directory. The service binds to 127.0.0.1. The inbox is a proposal/review surface only: **model workers are not started and queued tasks are not executed**.

## Verification status

- Windows CI smoke tests exercise service start, loopback health, proposal submission, invalid task-ID rejection, bounded read-only review, idempotent start, stop ownership checks, and persistence of pending records.
- Node CI validates the shared task contract, inbox API, module registry, and cross-repository task transport.
- A local Windows smoke deployment was started and checked during this work session. Runtime state is machine-local and can change; check the health/status command before relying on it.
- A separate allowlisted HTTPS remote task client is merged. Actual cross-device connectivity still depends on Tailscale Serve configuration, tailnet ACLs, the matching secret, and a live two-device smoke test.
- No production approval verifier with durable one-time consumption, expiry enforcement, or multi-process replay protection is claimed.
- No task execution, automatic approval, unattended model worker, or browser extension installation is claimed as verified.
- No repository can, by itself, prove that attention extraction or economic monopoly has been ended at a societal level.

## Open blockers — do not merge around them

### PR #1 — Legacy local mesh / guardian baseline

The legacy worker polls a separate coordinator on port 8080 and is not integrated with the current task inbox. Its coordinator URL is environment-configurable while a bearer token is attached, and the worker can execute model tasks automatically. Keep it in draft until exact-origin egress controls, redirect behavior, human approval, and integration tests are implemented.

### PR #8 — Mistral manual/API bridge

The bridge is intended to export a review prompt and import model output as unverified evidence. The Windows PowerShell import-mode smoke test is still blocked by a child-process hang. Keep it in draft; do not merge until export/import completes under PowerShell 5.1 with reproducible passing tests.

### PR #6 — Regenerative Syntropic Fabric visualization

This is a separate visualization using reconstructed placeholder graph data. It is not an operational control plane and is not part of the verified runtime. Keep its reconstructed-data disclaimer visible if it is used.

## Next engineering priorities

1. Complete a live two-device Tailscale Serve smoke test for remote proposal submit/list/idempotency, with a restricted tailnet ACL and no execution enabled.\n2. Complete a real-browser smoke test for Attention Guard and BrowserBridge using a temporary profile and reversible test settings.
3. Design an authenticated, auditable human-decision layer for proposals. A decision must not execute work by itself; execution must remain a separate, explicitly authorized boundary.
4. Integrate the consent gate with any future execution broker, and test denial, revocation, malformed policy, and replay cases.
5. Fix the Mistral bridge import-mode hang before considering merge.
6. Harden or replace the legacy local mesh before connecting it to the shared task inbox.
7. Add independent adversarial review and reproducible release evidence before declaring a component verified.

## Parallel contributor protocol

- Use separate feature branches and non-overlapping file ownership.
- Before editing, inspect the current main branch and open pull requests.
- Coordinate through repository artifacts, not assumptions that separate ChatGPT conversations share memory or live state.
- Report commit SHAs, test commands, observed results, and limitations.
- Never mark a component verified based only on intended behavior or a health endpoint.
- Do not introduce hidden telemetry, unapproved outbound data transfer, unattended execution, or destructive behavior without explicit human authorization.
