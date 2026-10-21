# Tesla-Grid Architecture for the HeavenzFire Unified Field

**Status:** architecture baseline; implementation is staged and evidence-gated. This document uses Tesla's grid-engineering mindset as an inspiration, not a claim of literal Tesla authorship or quantum hardware.

## Mission

Treat the Unified Field as a local-first, fault-contained computing grid. Every service is a node; interfaces are transmission lines; queues are dispatch; health and integrity observers are protection relays; signed or independently retained checkpoints are the audit record. A green process is not proof of useful work: end-to-end task completion is the service-level truth.

## Design laws

1. **Measure before dispatch.** Read service health, queue state, memory headroom, and disk headroom before scheduling expensive work.
2. **Separate observation from control.** Watchers report faults. Remediation is a separate, allowlisted controller with explicit policy, bounded retries, and an audit trail.
3. **Fail closed on trust boundaries.** No tokenless task routes, no secrets in command lines/logs, no unauthenticated network listeners, and no silent privilege escalation.
4. **Redundancy must be independent.** Separate journals and fault domains help only if their failure modes differ. Duplicate workers must not overload a resource-starved host.
5. **Preserve state before repair.** Snapshot configuration, database, and relevant logs before modifying service launchers or task state. Never delete repositories, backups, model weights, or user data as routine cleanup.
6. **Prove each claim.** Record command, timestamp, result, and limitation. Distinguish liveness, readiness, and end-to-end task success.
7. **Local-first by default.** Loopback APIs and local models stay local. Remote access must use authenticated private networking and scoped, revocable authorization.

## Current topology

| Component | Loopback port | Role | Acceptance evidence |
|---|---:|---|---|
| Dashboard | 8800 | Operator view | /health and /api/overview respond |
| Gateway | 8787 | Request ingress | Authenticated test request completes |
| Orchestrator | 8788 | Dispatch and coordination | Task transitions are persisted and observable |
| Agent | 8790 | Agent API | Health plus bounded task test |
| Senses | 8794 | Observation inputs | Health and freshness check |
| Discovery | 8795 | Service/node discovery | Health and bounded discovery test |
| Mesh coordinator | 8080 | Durable worker queue | /health, authenticated /enqueue, /poll, /complete, and persisted task lookup |
| Ollama | 11434 | Local model runtime | Model list and bounded inference smoke test |
| BrowserBridge | 18795 | Browser integration | Health, origin/permission checks, and approved-action audit |

These are configured endpoints, not a guarantee that every service is currently healthy. The most recent observer run found 8/9 configured endpoints reachable and the mesh coordinator unreachable. Windows PowerShell subsequently failed to initialize its managed runtime with error 800705af; therefore a fresh desktop status check could not be completed in that attempt. Treat the coordinator and host-resource state as unresolved until rechecked.

## Protection-relay architecture

### Plane A — service observer
- Probe only the configured loopback health endpoints.
- Record latency, HTTP status, timeout, and failure reason.
- Never start, stop, or mutate a service.

### Plane B — integrity/resource observer
- Independently validate journal hash-chain continuity.
- Record process/port observations, available RAM, and free system-drive space.
- Warn below 15 GB free disk and 1 GB available RAM; critical below 8 GB disk and 0.5 GB RAM.
- Never kill processes, delete files, rotate credentials, or change permissions.

The current Watchtower launcher starts two observer roles in each of two independently logged planes (four low-duty processes). This is deliberate logical redundancy, but not physical independence: all four still share one Windows host and its resource pool. The journals detect changes within retained chains; they do not prove an attacker could not replace an entire journal. Add signed/exported checkpoints to an independent destination before making stronger tamper-resistance claims.

## Dispatch and overload control

Before assigning work, the scheduler should enforce:
- a bounded queue and per-node concurrency limit;
- explicit task deadlines, cancellation, and retry budgets;
- exponential backoff with jitter for transient failures;
- circuit breakers for repeatedly failing dependencies;
- priority classes: integrity/safety tasks first, interactive work second, batch/model inference last;
- resource admission control that pauses batch inference when memory/disk headroom is below threshold;
- idempotency keys and durable task state so retries do not duplicate side effects;
- a dead-letter state for exhausted retries, with operator-visible reason.

A worker is not "available" merely because its port responds. It is eligible only when authenticated polling succeeds, its lease is valid, it reports capacity, and it can complete a harmless canary task.

## Recovery state machine

HEALTHY -> SUSPECT -> DEGRADED -> ISOLATED -> RECOVERY_PENDING -> VERIFIED

- **SUSPECT:** one failed probe; record and retry without disruptive action.
- **DEGRADED:** repeated failures or resource threshold crossed; throttle batch work.
- **ISOLATED:** dependency is unavailable or trust check fails; do not dispatch new dependent tasks.
- **RECOVERY_PENDING:** run only a named, allowlisted remediation with a timeout and pre-change snapshot.
- **VERIFIED:** require consecutive health successes plus a functional canary and state-consistency check.
- Any failed recovery returns to ISOLATED and requests operator review; no infinite restart loops.

Automated service restart, startup persistence, firewall changes, or destructive cleanup are not enabled by the observer. They require a separately reviewed controller, explicit operator approval, and a tested rollback path.

## Adversarial verification matrix

| Failure injected in a test environment | Required outcome |
|---|---|
| Health endpoint times out | Mark degraded; bounded retry; no restart storm |
| Coordinator returns 401 | Preserve auth; surface token/config mismatch; never disable auth |
| Worker dies mid-task | Lease expires; task is safely retried only if idempotent |
| Journal line altered or removed | Chain verification fails and identifies first broken sequence |
| One journal missing | Flag observer degradation; preserve the other journal |
| RAM falls below 1 GB | Pause batch inference and report pressure |
| Disk falls below 15 GB | Warn; do not delete user/project data |
| Duplicate completion arrives | Idempotency check prevents double side effect |
| Dashboard is healthy but task never completes | End-to-end SLO fails despite green liveness probes |
| Remote bridge receives unapproved command | Reject, log the decision, and perform no action |

Run destructive fault injection only against disposable fixtures, never the live user workspace.

## Delivery gates

1. **Protect:** keep Watchtower observer-only, confirm its four process identities and journal continuity, and capture an independent baseline.
2. **Stabilize:** regain a working PowerShell session; inspect RAM/disk/process pressure; do not start additional models until headroom is adequate.
3. **Restore mesh:** inspect the coordinator launcher and protected token flow; pass authenticated enqueue -> poll -> complete -> persisted lookup without exposing the token or weakening auth.
4. **Integrate:** expose a read-only Watchtower summary in the dashboard with clear stale/unknown states.
5. **Govern:** implement queue limits, idempotency, circuit breakers, and reviewed remediation policy.
6. **Verify:** run the adversarial matrix, preserve logs and test outputs, and promote from draft only after critical gates pass.

## Rollback and integrity

- Keep changes in a review branch and preserve the existing main branch until gates pass.
- Back up coordinator configuration and the SQLite database before changing launch behavior.
- Never log bearer tokens or decrypt them into command-line arguments.
- Revert only the exact change that introduced a regression; preserve evidence and user data.
- A successful health probe is a narrow fact. Production readiness requires sustained observation and end-to-end task evidence.


## Recovery evidence — 2026-10-21

- Found and fixed a startup gate defect in the mesh launcher: it checked five configured endpoints but compared the healthy count to four. The corrected check compares against the configured port count. A pre-change backup was preserved on the desktop as `mesh_launcher.ps1.bak-tesla-grid-20261021`.
- Launched the coordinator, loopback dashboard bridge, and three authenticated workers through the corrected launcher. All five health endpoints returned `ok=true`: 8080, 8081, 18101, 18102, and 18103.
- An end-to-end smoke task was enqueued through the bridge, assigned to worker `hf-worker-18102`, completed on attempt 1, and retrieved from persisted task state. Task ID: `4514b28a-492b-4efe-b14e-b9c006b8e2d1`. The test used a bounded local SHA-256 task, not model inference.
- After recovery, all four Watchtower observer processes still reported running. Available RAM was approximately 1.29 GB and C: free space 8.45 GB; both remain below warning thresholds (RAM near 1 GB, disk below 15 GB).
- This verifies a live queue round-trip at the time of test; it does not prove persistence across reboot, long-duration stability, or a crash-prevention guarantee. The launcher is a foreground supervisor session and has not been installed as a startup task. Reboot persistence and dashboard integration remain open gates.


## Dashboard integration and adversarial verification — 2026-10-21

- Installed dashboard endpoint inventory now includes the mesh coordinator, bridge, and all three authenticated workers. The live overview returned 14 configured services and all five mesh endpoints healthy.
- Added a local Mesh Task Console with bounded hash and allowlisted model task controls. The dashboard server proxies task enqueue and persisted task lookup through the loopback bridge; it rejects unsupported task types, oversized inputs, invalid rounds, unapproved model names, and cross-origin writes.
- The dashboard-to-queue-to-worker-to-persisted-read canary completed successfully on `hf-worker-18101`, attempt 1. No model inference was used for this canary.
- Existing Node dashboard test suites passed: 12 tests, 0 failures, after correcting a stale endpoint assertion to match the worker's actual local Ollama endpoint at port 11434.
- The repeatable PowerShell 5.1 adversarial suite passed: dashboard health; five mesh endpoints visible and healthy; unauthenticated coordinator stats rejected with HTTP 401; unsupported shell task rejected with HTTP 400; cross-origin enqueue rejected with HTTP 403; oversized hash input rejected; invalid rounds rejected; unapproved model rejected; all relevant listeners loopback-only; and successful persisted canary completion.
- The remaining dashboard work is a read-only Watchtower journal/resource summary, sustained stability tests, and reboot recovery. The latest resource snapshot remains constrained at approximately 1.29 GB available RAM and 8.45 GB free on C:; model batches remain deferred.


## Resource admission hardening — 2026-10-21

The dashboard mesh proxy now checks available physical RAM before accepting a `model_task`. If Node reports less than 1 GiB available, it returns HTTP 503 and does not enqueue the task. This is enforced server-side rather than relying only on a UI warning. The adversarial suite verified this behavior under the current constrained host state. Hash canaries remain available because they are bounded and do not invoke local model inference.

Latest observed host snapshot: approximately 0.91 GB available RAM and 8.41 GB free on C:. This is a warning state; do not launch model batches. The extra test-only worker on port 18127 was stopped after its process identity and listener were verified, preserving the three mesh workers and the sixteen configured agent-worker endpoints.
