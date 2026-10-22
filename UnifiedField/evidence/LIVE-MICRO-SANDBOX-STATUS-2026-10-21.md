# Live Micro-Sandbox Verification — 2026-10-21

## Scope

Record the observed state of the connected Windows development machine during the Unified Field continuation session. This is a point-in-time evidence delta, not a release certification. It does not replace earlier test reports and does not imply the full repository ecosystem is unified.

## Observed results

| Check | Result | Evidence boundary |
|---|---|---|
| Ollama API | PASS — HTTP 200 | API responded and returned a live model inventory; this alone does not prove a model task completed. |
| Agent service :8790 | PASS — health reported OK | Health only. |
| Gateway :8787 | PASS — health reported OK | Health only. |
| Orchestrator :8788 | PASS — health reported OK | Reported gateway available and circuit closed; health is not task acceptance. |
| Specialist endpoints :18111–:18126 | PASS — all 16 health endpoints responded healthy | They report the same `HeavenzFire-ENHANCED-DUAL` service family. Do not count these endpoints as 16 independent reasoning agents. |
| Inference API :11800 and runtime :11801 | PASS — both returned HTTP 200 from `/v1/models` | Both exposed `heavenzfire-qwen-0.5b`; model inference was not thereby proven. |
| Mesh bridge :8081 | PASS — bounded deterministic hash task completed | 1,000 SHA-256 rounds returned digest `a2b49d23ca2136fd5120a997ec9bcda68a103c44ee2fec9dbdbfb9225979f634`. This verifies the bridge's hash-task execution path, not a full LLM delegation cycle. |
| BraidedPipeline acceptance test | PASS — 10 checks; process exit 0 | Checks included handshake, replay defense, DAG validation, parallel pipeline, and hash-chained trace. |
| Legacy coordinator :8080 | BLOCKED — process owns listening port but HTTP health request could not connect | PID observed as 26448 running `coordinator.py`. The process was not terminated or restarted. |
| Legacy coordinator SQLite queue | EMPTY at inspection | Database counts: 106 completed, 2 failed, 0 queued, 0 in-flight. |
| Model task through :8081 | BLOCKED by resource admission | Windows reported approximately 0.48 GiB free RAM, below the 1-GiB inference threshold. The guard was not bypassed. |

## Key findings

1. The newer loopback mesh bridge can execute a real bounded deterministic task and return a digest.
2. The braided pipeline's current acceptance suite passes its 10 reported checks.
3. The legacy coordinator/worker lane is not currently usable through its HTTP interface: port 8080 is occupied by a process that does not answer the health request. Do not enqueue against this coordinator until recovery and authenticated task round-trip are verified.
4. Model work remains resource-constrained. Preserve the existing RAM admission guard; unload nonessential model processes or recover memory before retrying.
5. The 16 health endpoints are endpoint observations, not evidence of 16 independent agents or successful delegated work.

## Next executable gates

- [ ] Recover the :8080 coordinator using a reviewed, reversible process-management step; do not force-kill it without an explicit approved recovery action.
- [ ] After coordinator recovery, verify unauthenticated access is rejected on protected routes, enqueue one bounded allowlisted hash task with the existing local credential (never print it), poll to a terminal state, and independently reproduce the returned digest.
- [ ] Recheck free RAM before model inference. Do not bypass the 1-GiB admission threshold.
- [ ] Run the relevant mesh adversarial suite and preserve command, exit code, task ID, terminal state, digest, and timestamp.
- [ ] Only after the above passes, update the runtime contract with a new end-to-end evidence reference.

## Reproduction notes and limitations

- Commands were executed against the user's connected Windows machine using PowerShell-compatible checks.
- No secret/token values are included in this report.
- No process was stopped, restarted, or modified as part of this evidence capture.
- The :8080 coordinator remains blocked; its recovery and a fresh authenticated task round-trip are not claimed.
- Results are snapshots and may change when processes or machine resources change.
