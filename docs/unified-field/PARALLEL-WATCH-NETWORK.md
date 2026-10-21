# HeavenzFire Parallel Watch Network

Status: implemented on the connected Windows desktop; the last confirmed start launched four observer processes and the status command reported all four running. A subsequent fresh status attempt could not initialize Windows PowerShell (error 800705af), so current liveness is temporarily unverified. See the Tesla-grid architecture for the wider delivery gates.

## Purpose
Two logical protection planes observe the existing Unified Field without becoming privileged controllers. Each plane runs a service observer and an integrity/resource observer, with separate journals.

- **Plane A — Service Observer:** checks configured loopback health endpoints, records reachability, latency, and HTTP status.
- **Plane B — Integrity/Resource Observer:** validates hash-chain continuity, records process/port observations and disk/RAM headroom, and flags divergence without changing the system.
- Each plane has its own health and integrity observer process. These are four processes on one Windows host, not four independent machines or independent physical fault domains.

## Trust boundaries
- Loopback-only by default; no inbound listener and no external telemetry.
- No auto-kill, auto-restart, file deletion, credential rotation, or permission changes.
- Each journal record hashes the prior record hash plus canonical JSON of the current payload.
- A hash chain detects edits/deletions within a retained journal; it does not prove that an administrator did not replace the entire journal. Periodic offline/exported checkpoints are a separate hardening step.
- Health endpoints are signals, not proof that queued work is completing. End-to-end task tests remain required.
- This is classical monitoring code, not a quantum computer or cryptographic root of trust.

## Configured service inventory
Dashboard 8800, gateway 8787, orchestrator 8788, agent 8790, Ollama 11434, senses 8794, discovery 8795, BrowserBridge 18795, mesh coordinator 8080. Missing services are recorded as missing; the monitor does not start them.

## Last verified test evidence
- Python syntax check and four one-shot plane/role combinations passed.
- Test reported 8/9 configured endpoints reachable; mesh coordinator on 127.0.0.1:8080 was unreachable.
- Resource snapshot during testing showed about 0.99 GB available RAM and 8.73 GB free on C:, below the configured 1 GB RAM / 15 GB disk warning thresholds.
- Start launched four background observers; the subsequent Status invocation reported all four PIDs as running.
- A later desktop command failed before script execution because Windows PowerShell could not load its managed runtime (error 800705af). Current process liveness and current resource values therefore need rechecking.

## Operational limits
The observers detect and record faults; they do not guarantee crash prevention and do not restart the mesh coordinator. Four processes on one host share the same RAM, disk, OS, and power domain. Hash-chain continuity alone does not provide an independent backup.

## Next gates
1. Restore a working desktop command session and recheck current observer processes, RAM, and disk.
2. Investigate the PowerShell runtime initialization failure before adding more local processes.
3. Restore the mesh coordinator using its protected token flow; do not weaken authentication to make the health check pass.
4. Validate authenticated enqueue -> poll -> complete -> persisted lookup.
5. Add read-only dashboard integration and independently retained journal checkpoints.
6. Review any automated remediation separately, with allowlists, bounded retries, audit logs, explicit approval, and rollback.
