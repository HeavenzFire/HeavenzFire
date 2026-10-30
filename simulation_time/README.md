# Simulation-time runtime v0.1

This module is an initial, local-first logical-clock scheduler for deterministic simulation experiments. It is deliberately separate from production orchestration and does not execute external commands or perform network I/O.

## Current behavior

- Monotonic virtual time (`advance_to`); no wall-clock sleep.
- Events ordered by timestamp, then insertion sequence for ties.
- Named callbacks registered explicitly; unknown event types are rejected.
- Finite numeric times and JSON-compatible, finite payloads are required.
- Per-advance event budget is checked before dispatch.
- Canonical JSON trace records and a SHA-256 trace digest support reproducibility checks. The digest is not a digital signature and does not establish authorship.

## Run tests

From the repository root with Python 3.10+:

    python -m unittest tests.test_simulation_time_clock -v

The tests are committed, but were **not executed by this GitHub write operation**. Run them locally or in CI before merging.

## Minimal use

    from simulation_time.clock import SimulationClock
    clock = SimulationClock()
    observed = []
    clock.register("sample", lambda payload: observed.append(payload))
    clock.schedule(2.0, "sample", {"value": 42})
    clock.advance_to(5.0)
    assert observed == [{"value": 42}]
    print(clock.replay_digest())

## Safety and scientific limits

Simulation-time scaling changes the logical schedule, not processor speed, elapsed physical time, or relativistic time. Callback functions run synchronously in the calling process and must be trusted, bounded code. The event-count limit does not bound callback runtime or memory usage. This is not a sandbox for untrusted code.

This is a software scheduling primitive, not a biological model. Cancer research requires a separate domain model, cited and versioned data, calibration, uncertainty analysis, external validation, and qualified scientific review. No clinical or treatment claims are supported by this module.

## Next gates

1. Execute tests on supported Python versions and add CI integration.
2. Add explicit cancellation and stable event identifiers.
3. Specify replay semantics for callback failures and state mutation.
4. Add property-based tests for ordering, monotonicity, and event-budget behavior.
5. Integrate only after the existing Unified Field service boundaries are inspected.
