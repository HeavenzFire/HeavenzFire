# Offline-first continuity plan v0.1

## Objective
Connectivity loss must not erase task intent or block work that can run locally. Network-dependent actions should wait safely in a durable queue and resume after explicit reconciliation.

## Failure modes and behavior

| Failure | Expected behavior | Recovery gate |
|---|---|---|
| Internet/GitHub unavailable | Continue local edits, local tests, simulations, and ledger writes | Push only after connection returns; reconcile remote changes first |
| Android ↔ Windows link lost | Each device keeps its own durable work; no assumption of live coordination | Reconnect over private authenticated transport and reconcile IDs/checkpoints |
| Worker crashes | Lease expires; task returns to pending queue | Retry only if task is safe to retry; use idempotency keys for side effects |
| Duplicate task submission | Same idempotency key and same content returns original task ID | Same key with different content is rejected |
| Corrupt/incomplete checkpoint | Preserve previous known-good checkpoint; mark current work untrusted | Validate hashes/schema and recover from last verified checkpoint |
| Disk pressure | Stop admitting nonessential work before disk is exhausted; preserve source and ledger | Alert, free only approved disposable caches, then resume |
| Local model unavailable | Queue model-dependent tasks; continue deterministic non-model work | Verify model manifest and endpoint before dispatch |
| Conflicting changes after reconnect | Keep both versions and produce a conflict report | Human or deterministic merge policy resolves conflict; never silently overwrite |

## Runtime rules

1. The SQLite task ledger is local durable intent, not a distributed consensus database.
2. A task is claimed with a lease. Expired leases can be reclaimed after a worker crash.
3. At-least-once execution is possible: a worker may perform work and crash before recording success. External side effects therefore require idempotency keys or explicit reconciliation; the ledger alone cannot guarantee exactly-once effects.
4. Network writes, repository pushes, destructive operations, credential changes, and deployment actions remain gated by their own authorization and verification policies.
5. Use atomic, versioned checkpoints; record input hashes, code revision, parameters, outputs, test results, and failure reason.
6. Apply backpressure when free disk, RAM, CPU, or queue limits cross configured thresholds. Do not allow a simulation-time multiplier to bypass real resource budgets.
7. Offline mode must be visible in status and logs. Do not claim remote synchronization until a successful acknowledgement is received.

## Recovery procedure

1. Detect and classify the failure (DNS, transport, remote service, worker, disk, or model).
2. Continue only tasks marked local-safe and resource-safe.
3. Persist task state and a validated checkpoint.
4. On reconnection, fetch remote state before pushing; compare commit ancestry and task IDs.
5. Deduplicate by idempotency key; quarantine conflicts and unverifiable outputs.
6. Run tests and integrity checks; publish only after explicit success evidence.

## Throughput expectations

A faster logical clock does not itself increase CPU throughput. Real speedups must be measured from completed, validated tasks per wall-clock hour. Parallel workers help only when tasks are independent and resources are available. Establish a serial baseline, then benchmark 2, 4, 8, and 16 workers while recording useful completions, retries, failures, CPU/RAM/disk, model latency, and coordination overhead. Compare quality and failure rate as well as speed.

## Verification status

The task-ledger implementation and unit tests are committed on a feature branch. Tests have not yet been executed in this session, and the ledger has not been integrated with the production orchestrator. Treat this as an implementation candidate, not a proven always-on failover system.