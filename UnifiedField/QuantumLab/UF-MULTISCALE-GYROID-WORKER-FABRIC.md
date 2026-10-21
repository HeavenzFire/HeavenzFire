# Multiscale Gyroid Worker Fabric

Status: design proposal. This describes a testable scheduling model, not a claim that a validated biological brain, physical phase lock, or live swarm already exists.

## Design idea

Use one topology with many scales of work. Tiny workers handle tiny bounded operations; larger workers handle synthesis and coordination. The scheduler can split work downward and aggregate it upward. Worker count, active concurrency, and task complexity are separate variables.

## Scale vocabulary

| Tier | Meaning in software | Example work |
|---|---|---|
| NANO | Very small logical function/task; usually no separate process | parse one field, validate one hash, classify one event |
| MICRO | Small isolated task with a narrow contract | run one unit test, inspect one diff hunk, redact one export |
| MESO | Coordinated group of micro tasks | review a module, compare evidence, reconcile a queue batch |
| MACRO | Mission-level planner or integrator | plan a release, coordinate adapters, summarize verified results |
| META | Policy and cross-mission oversight | check invariants, budgets, permissions, provenance and mission isolation |

These are scheduling labels, not physical nanotechnology. Start with logical workers in one process; do not create an OS process per tiny task.

## Scale up and down

1. Decompose: a macro task becomes a bounded DAG of meso/micro/nano tasks with explicit inputs and acceptance tests.
2. Assign: choose a worker role and scale tier based on estimated complexity, risk, resource budget, and available capabilities.
3. Execute: run only the tasks whose dependencies and policy gates are satisfied.
4. Verify: independent checks produce evidence references, not just a second copy of the builder's answer.
5. Aggregate: combine accepted child outputs with provenance; retain disagreement and missing evidence instead of smoothing them away.
6. Escalate: if a small worker encounters ambiguity, high risk, conflicting evidence, or resource exhaustion, stop and ask a larger reviewer or human.
7. Reduce: after completion, collapse the task graph into a compact summary while preserving links to underlying evidence.

## Gyroid-inspired topology

The existing deterministic topology planner can provide a graph scaffold for clusters and bounded inter-cluster links. A future gyroid-inspired mapping may assign logical workers to graph nodes and use edges for task/event routing. It must remain an explicit mapping layer: the current topology planner is PLAN_ONLY and does not create live links, run workers, or replicate data.

Proposed graph roles:
- local cell: one worker or small worker group
- cell coordinator: schedules within a cluster and buffers work during disconnection
- cluster anchor: forwards approved metadata across clusters
- cross-cluster edge: bounded route for task references and evidence digests
- observer node: read-only health and provenance aggregation

Keep payloads local when possible; route references and minimal metadata. Cross-cluster routing must obey module permissions and data classification. Do not assume geometric proximity means trust or security.

## Frequency and phase-lock analogy

Use the analogy only where it becomes measurable engineering:
- **frequency** = configured scheduling cadence or heartbeat interval
- **phase** = logical tick/epoch within a simulation
- **phase error** = observed lag from the expected tick
- **lock** = workers have converged on the same protocol epoch and compatible task revision within a defined tolerance
- **unlock/degraded** = stale heartbeat, clock uncertainty, missed epochs, or revision mismatch

Prefer monotonic local clocks for durations and sequence numbers for ordering. Do not require synchronized wall clocks for correctness. A worker with stale epoch or stale evidence must not vote on a current decision. This is logical coordination, not a claim about quantum coherence, biological consciousness, or literal oscillators.

## Resource controller

- Set independent caps for logical workers, active tasks, per-tier concurrency, queue length, memory, CPU time, and retry count.
- Scale concurrency up only when recent measurements show capacity and the queue has eligible work.
- Scale down on rising latency, memory pressure, repeated timeouts, or stale telemetry.
- If telemetry is unavailable, choose the conservative profile and pause resource-intensive work.
- Reserve capacity for policy, cancellation, and recovery tasks so the system can still stop itself under load.
- Use bounded batches and backpressure; never create an unbounded worker or message fan-out.

## Verification and trust

Role separation is not independent verification by itself. Record worker identity, implementation/version, input digest, task revision, evidence digest, checks performed, and result. Two roles running the same code over the same unchecked output do not count as independent verifiers. Mandatory invariants cannot be overridden by a vote or worker count.

## Simulation milestones

A. Deterministic logical-worker simulation with scale tiers, bounded concurrency, and reproducible seed.
B. Property tests for split/aggregate determinism, dependency ordering, backpressure, stale epoch rejection, duplicate events, and cancellation.
C. Render simulated workers and graph edges on the dashboard with a prominent SIMULATED label.
D. Connect simulation to the offline journal in dry-run mode.
E. Introduce a single restricted real worker process; measure overhead before increasing concurrency.
F. Add container/OS sandboxing only with explicit mounts, process identity, quotas, threat review, and escape testing.

## Acceptance criteria

- Every worker/task has a tier, role, scope, budget, and evidence contract.
- Scale up/down decisions are deterministic for a fixed configuration and input trace.
- A task cannot exceed the configured concurrency or resource budget.
- Stale epoch, missing evidence, capability mismatch, or mandatory policy failure blocks acceptance.
- A worker failure does not deadlock unrelated tasks.
- Simulation, configured worker, reachable process, and verified task execution are displayed as distinct states.
- The system can pause one mission or all work and preserve the journal.
- No real personal/medical data, credentials, or destructive external action is needed for tests.