# Unified Field — Adversarial Defense Restoration Plan

**Status:** integration plan committed on a feature branch; this is not proof that tools are installed or running on the ASUS.
**Scope:** restore and connect existing HeavenzFire defensive components without bypassing consent, authentication, audit, or human approval.

## Existing repository components identified

1. `UnifiedField/QuantumLab/worker-forge.cjs` and `README-WORKER-FORGE.md`
   - Deterministic evaluation matrix and candidate validation.
   - Adversarial profiles: prompt injection, malformed input, unauthorized tool request, stale evidence, contradictory evidence, output-schema violation, budget exhaustion, timeout recovery, duplicate replay, and dependency cycles.
   - Repeated-run determinism checks; full qualification requires matrix coverage, no critical failures, a pass threshold, and independent review.
   - Smoke tests explicitly do not qualify or promote a candidate.
2. `UnifiedField/QuantumLab/worker-registry.cjs`
   - Validated blueprints, atomic registry writes, idempotent registration, and smoke evidence.
   - Candidates remain unqualified until the separate qualification process succeeds.
3. `UNIFIED_FIELD_STATUS.md`
   - Documents the task contract/inbox, consent gate, read-only review, proposal submission, hash-chained evidence ledger, Attention Guard, and BrowserBridge.
   - Explicitly notes unresolved risks in the legacy mesh and outstanding real-browser tests.

## Required integration gates

### A. Network and terminal boundary
- Keep Tailscale as the private network transport; verify actual peer status and reachability before any service test.
- Prefer authenticated SSH or the authenticated HeavenzFire Commander for remote execution.
- Do not expose Telnet to the public internet. If retained for a compatibility smoke test, restrict it to a private isolated test network, non-privileged account, and harmless echo only. Never send passwords, keys, or secrets over Telnet.
- Keep Commander bound to loopback unless a separately reviewed authenticated network design explicitly requires otherwise.

### B. Request authorization
- Validate schema, host identity, unique request ID, expiry, replay state, and exact permitted action before execution.
- Enforce least privilege and an explicit action allowlist in the execution broker, not just in prompts.
- Read/status operations and command execution remain distinct authorization tiers.
- Destructive operations, credential access, privilege changes, service/firewall changes, and external data transfer require explicit human approval.
- Denial, timeout, malformed policy, revoked consent, and uncertain state must fail closed.

### C. Adversarial validation
- Run the Worker Forge fixed profiles and expand the host-side bridge tests to include:
  - prompt injection embedded in task data, files, logs, and tool output;
  - malformed/oversized requests and schema confusion;
  - unauthorized action and privilege escalation attempts;
  - stale, contradictory, forged, or missing evidence;
  - duplicate request replay and request-ID collisions;
  - path traversal and workspace-root escape;
  - timeouts, partial writes, interrupted workers, and recovery;
  - log tampering, hash-chain breakage, and secret leakage;
  - dependency cycles and exhausted call/time budgets.
- Test both positive controls (authorized harmless request succeeds) and negative controls (unauthorized request is denied and produces no side effect).
- Keep attack payloads inside isolated test fixtures. Do not test against third-party systems.

### D. Evidence and release gate
- Save exact commit SHAs, OS/runtime versions, test commands, exit codes, sanitized output, and artifact hashes.
- Separate static analysis, unit tests, VM tests, and actual ASUS end-to-end proof.
- Require an independent reviewer for worker qualification/promotion.
- Never infer that a component is active from repository presence, a commit message, or a health endpoint alone.

## Restoration sequence

1. Inventory current branches, open PRs, and security-related scripts/artifacts before merging or replacing anything.
2. On the ASUS, run the existing Windows Sentinel diagnostic and collect its JSON/Markdown report; do not delete or overwrite the previous report.
3. Verify Tailscale peer state and reachability; verify Commander locally on `127.0.0.1:18077`.
4. Complete the read-only Commander status handshake and commit its real ASUS result package to the relay. Do not substitute VM results.
5. Run harmless authenticated echo and negative authorization/replay tests.
6. Run Worker Forge smoke tests, then the full deterministic qualification matrix where the controlled evaluator is available.
7. Integrate only after tests pass; preserve rollback instructions and require review before changing firewall, service exposure, credentials, or destructive behavior.

## Acceptance criteria

- No public unauthenticated terminal endpoint.
- Unauthorized, malformed, expired, or replayed requests cause no command execution or external side effect.
- The valid harmless echo returns the expected output and exit code.
- Audit integrity verifies; no credentials or secrets appear in artifacts.
- All claimed ASUS tests have evidence captured on the actual Windows host.
- Failed or incomplete checks are reported as blocked, never silently counted as passing.
