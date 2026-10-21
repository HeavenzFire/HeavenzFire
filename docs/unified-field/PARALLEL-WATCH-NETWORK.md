# HeavenzFire Parallel Watch Network

Status: implementation baseline; not yet deployed or independently verified on the desktop.

## Purpose
Two separate, local-first observers watch the existing Unified Field without becoming privileged controllers. They are deliberately redundant, independently logged, and fail-safe.

- **Watchtower A — Service Observer:** checks configured loopback health endpoints, records reachability, latency, and HTTP status.
- **Watchtower B — Integrity Observer:** verifies the hash-chain continuity of both journals, records process/port observations and disk/RAM headroom, and flags divergence without changing the system.

## Trust boundaries
- Loopback-only by default; no inbound listener and no external telemetry.
- No auto-kill, auto-restart, file deletion, credential rotation, or permission changes.
- The two journals are separate JSONL files. Each record hashes the prior record hash plus canonical JSON of the current payload.
- A hash chain detects edits/deletions within a retained journal; it does not prove that an administrator did not replace the entire journal. Periodic offline/exported checkpoints are a separate hardening step.
- Health endpoints are signals, not proof that queued work is completing. End-to-end task tests remain required.
- The process is a classical monitor, not a quantum computer or cryptographic root of trust.

## Initial service inventory
Dashboard 8800, gateway 8787, orchestrator 8788, agent 8790, Ollama 11434, senses 8794, discovery 8795, BrowserBridge 18795, mesh coordinator 8080. Missing services are recorded as missing; the monitor does not start them.

## Deployment gates
1. Run syntax checks.
2. Run a local-only smoke test and validate both independent journal chains.
3. Deploy both watchers through a PowerShell 5.1-compatible launcher.
4. Verify dashboard integration and controlled restart policy separately.
5. Keep a rollback copy before modifying any existing launcher or scheduled task.
