# Unified Field Worker Legion — Simulation and Micro-Sandbox Design

Status: design proposal. A simulated worker is a logical worker record, not a separate process, independent AI, or proof of parallel execution.

## Objective

Create a large, testable pool of cooperating worker roles without launching unbounded processes or giving every worker unrestricted tools. Scale logical workers independently from execution concurrency. Begin with deterministic simulations; add real process/container isolation only after resource budgets and threat boundaries are verified.

## Worker classes

- Planner: decomposes a request into bounded task records.
- Builder: proposes a change within an explicitly assigned repository/workspace scope.
- Verifier: checks a change against declared tests and evidence.
- Adversarial reviewer: looks for counterexamples and missing assumptions.
- Policy gate: evaluates required invariants and approval requirements.
- Evidence curator: indexes source references and hashes without copying secrets.
- Adapter monitor: reports observed status for one declared adapter.
- Queue reconciler: detects duplicates, stale revisions, and conflicts.
- Mission worker: handles one versioned mission module, such as family protection, without cross-module data access by default.

## Isolation levels

1. L0 logical simulation: in-memory task records and deterministic handlers; no filesystem, network, shell, or model calls.
2. L1 restricted worker process: separate process with a narrow message schema, time/memory limits, read-only workspace where possible, and no network by default.
3. L2 OS/container sandbox: only after platform support, explicit filesystem mounts, user separation, resource limits, and tested escape boundaries are established.

Do not describe L0 as a secure sandbox. Do not run untrusted model-generated code inside a logical worker and call it isolated.

## Scale and backpressure

- Use a worker registry with roles, capabilities, status, last heartbeat, current task, and resource budget.
- Keep logical worker count separate from active concurrency. Start with a small active pool and tune from measured CPU, memory, disk, and task latency.
- Apply bounded queues, per-role concurrency, task deadlines, retry budgets, and circuit breakers.
- Use a deterministic scheduler for simulations; record seed, configuration, task input hash, and outputs for reproducibility.
- Stop scheduling new work when resource telemetry is stale or a configured safety threshold is crossed.
- Prefer many lightweight logical workers over many OS processes. Spawn real processes only when the task requires a distinct trust boundary.

## Coordination protocol

Every task includes task_id, parent_task_id, mission, worker_role, input_ref, required_capabilities, deadline, attempt, and evidence_refs. Workers return a typed result: SUCCEEDED, BLOCKED, FAILED, or CONFLICT, plus a short reason and evidence references. Workers cannot grant themselves capabilities or approve their own high-risk changes.

Workers communicate through the journal/queue, not shared mutable global state. Duplicate delivery must be idempotent. A reviewer should not simply copy the builder's conclusion: verification requires distinct checks and recorded evidence. Distinct role labels alone do not establish independent verification.

## Safety rules

- No unrestricted shell, credential access, public listener, or automatic deployment in the simulator.
- High-risk actions remain proposals requiring explicit human approval.
- Worker output and retrieved content are untrusted input.
- Do not include personal medical data or secrets in test fixtures.
- Report a worker as simulated, configured, or live based on observable evidence; never conflate these states.
- Provide a global pause, per-mission pause, and queue drain/cancel operation.

## Initial acceptance tests

1. Same input and seed produce the same schedule and output.
2. Active concurrency never exceeds the configured bound.
3. Invalid roles/capabilities are rejected.
4. Duplicate task IDs do not create duplicate side effects.
5. Failed workers do not stall unrelated tasks.
6. Timeouts and retry exhaustion become visible terminal outcomes.
7. A policy failure cannot be overruled by worker vote count.
8. Registry labels distinguish simulated workers from verified live processes.
9. Queue growth triggers backpressure instead of unbounded memory growth.
10. No test needs network access, real credentials, patient data, or destructive actions.

## Rollout

Phase A: deterministic in-process simulation and tests. Phase B: connect the simulator to the existing task journal in dry-run mode. Phase C: dashboard visualization with explicit SIMULATED labels. Phase D: add one restricted real worker process and fault-injection tests. Phase E: expand only after measured resource usage and security review. Offline tasks should continue locally; tasks that need remote services remain queued until those services are observed reachable.