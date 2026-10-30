# Time-Dilated Digital Environments — v0.1 Specification

Status: proposal for review; implementation and runtime integration are not yet verified.

## Goal

Provide multiple isolated digital environments whose *simulation time* can run faster or slower than wall-clock time, pause, step deterministically, and replay recorded events. This is software time scaling, not physical relativistic time dilation and not a claim that hardware executes faster than its actual limits.

## Initial scope

- Local-first engine; no network dependency for core clock/scheduler behavior.
- Multiple named environments, each with its own virtual clock and event queue.
- Time scale is a positive rational number (numerator/denominator) or an explicit paused state. Avoid floating-point accumulation for clock advancement.
- Monotonic wall-clock source; never use wall-clock calendar time to measure elapsed durations.
- Deterministic event ordering by (virtual timestamp, stable sequence number).
- Append-only JSONL event log with schema version, environment ID, event sequence, wall-clock observation, virtual time, action type, and payload digest.
- Pause, resume, single-step, bounded advance, export/import, and replay.
- Resource limits: maximum queued events, maximum simulated advance per request, execution deadline, and bounded log size/rotation.
- External side effects disabled by default. Any future adapter must use explicit allowlists and approval for destructive or privileged actions.

## Clock model

For an environment with scale p/q, virtual time advances by elapsed monotonic wall time multiplied by p/q while running. A scale of 2/1 advances simulation time at twice wall time; 1/2 advances at half speed; paused environments do not advance. Scheduling is event-driven; the engine must not promise that callbacks execute at the exact requested wall-clock instant under load.

Use integer nanoseconds or integer ticks internally. Document rounding and overflow behavior. Scale changes take effect at a defined transition boundary: first account for elapsed time under the old scale, then apply the new scale.

## Proposed interface

- `create_environment(id, scale)`
- `get_clock(id)`
- `set_scale(id, numerator, denominator)`
- `pause(id)` / `resume(id)`
- `schedule(id, virtual_time, event_type, payload)`
- `advance(id, duration)` for deterministic, bounded test/simulation stepping
- `export_log(id)` / `replay(log)`

Interface names are illustrative until reconciled with the existing Unified Field conventions.

## Architecture boundaries

1. Temporal engine: clock arithmetic and state transitions only.
2. Scheduler: stable ordering and bounded dispatch.
3. Environment registry: IDs, configuration, lifecycle.
4. Event ledger: versioned records and replay inputs.
5. Policy adapter: checks authorization before any external side effect.
6. Verification harness: invariant tests, differential tests, fuzzing, and performance measurements.

Keep the core engine independent of model providers and network services. Integrate with existing HeavenzFire services only after their actual contracts and health checks are inspected; do not assume port availability or claim connectivity without evidence.

## Required invariants and tests

- Paused clock remains unchanged across wall-clock delays.
- Scale 1/1 tracks monotonic elapsed time within a documented tolerance.
- Scale p/q produces the expected rational advancement, including repeated scale changes.
- Equal-time events dispatch in stable sequence order.
- Replay of the same event log yields the same virtual state hash.
- Invalid scale (zero or negative numerator/denominator), unknown environment, malformed log, timestamp regression, and overflow fail safely.
- Queue and advance limits are enforced.
- Cancellation and shutdown leave no background worker running.
- Property-based/fuzz tests cover event ordering, pause/resume, scale changes, and malformed serialized inputs.
- Benchmarks report event count, wall duration, throughput, memory, and error bounds; do not state performance gains without measurements.

## Muse collaboration protocol

Muse is a collaborating implementation/review agent, not a separate source of truth. Both contributors should work from this specification and the same target branch/PR. Before implementation, Muse should:
1. Inspect existing repository structure and identify the best existing integration point.
2. Report reusable code, conflicting clock abstractions, and interface constraints with file paths.
3. Propose tests before changing architecture.
4. Submit changes as a reviewable commit/branch or a patch; do not create a parallel service or duplicate registry.
5. Report exact test commands, outputs, failures, and untested assumptions.

Merge only after independent review and passing tests. Do not place credentials, private user data, or real secrets in logs or fixtures.

## Acceptance criteria

- A minimal local prototype can create two environments at different scales and prove independent clocks.
- Unit tests verify clock invariants and deterministic event ordering.
- Replay test reproduces the same state hash.
- Safety limits and failure paths are tested.
- README documents setup, API, semantics, limitations, and test results.
- All claims are tied to reproducible commands and observed output.

## Implementation sequence

1. Inspect existing code and choose language/runtime consistent with the target repository.
2. Implement pure clock arithmetic and unit tests.
3. Implement deterministic scheduler and event log.
4. Add replay and state-hash verification.
5. Add policy boundaries and resource limits.
6. Integrate with the existing Unified Field only through a documented adapter.
7. Benchmark and publish results with limitations.

## Explicit limitations

This design provides accelerated or slowed *simulation time* by changing how software schedules and interprets events. It does not alter physical time, bypass CPU limits, make external systems run faster, or by itself provide quantum speedup. Any quantum-specific behavior requires a separately specified model and validated experiments.
