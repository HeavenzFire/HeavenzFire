# Unified Field Core Contract

Status: architecture proposal. This is the common contract for the Unified Field; it does not assert that every component is already connected or continuously running.

## System layers

1. **Core coordinator** validates task schemas, policy decisions, capabilities, idempotency, and state transitions.
2. **Durable local journal** records append-only events and supports restart recovery, duplicate detection, and explicit conflicts.
3. **Adapter registry** lists GitHub, local worker, Ollama/Digital Brain, orchestrator, dashboard, and browser/desktop adapters with measured status and declared permissions.
4. **Scheduler** routes eligible work to matching roles and scale tiers under concurrency, timeout, retry, and resource budgets.
5. **Policy gate** applies ternary outcomes: ACCEPT (+1), ABSTAIN (0), REJECT (-1). Missing/stale evidence abstains; mandatory invariant failure rejects.
6. **Mission modules** implement separate goals behind versioned interfaces. Modules do not receive other modules' private data by default.
7. **Dashboard** renders observed status, evidence references, queue depth, last-seen time, and blockers; simulation/configuration/live execution must be distinct states.

## Common task envelope

Required metadata: schema version, stable task ID/idempotency key, mission, action, origin, creation timestamp, requested capabilities, risk class, input reference, evidence references, revision, and state. Add an approval reference for gated actions. Keep sensitive payloads in authorized local storage; do not put credentials or patient-level data in the task envelope.

## State transitions

Normal path: QUEUED -> VALIDATED -> READY -> RUNNING -> SUCCEEDED. A task may become BLOCKED with a reason, FAILED with sanitized diagnostics, or CONFLICT when its revision is stale. SUCCEEDED, FAILED, and CANCELLED are terminal; a materially new attempt gets a new task ID. No task skips validation or policy/approval gates.

## Online/offline contract

- Local-only, authorized work may continue offline.
- Remote-dependent work stays queued until reachability and authorization are observed.
- Reconnection validates schema, idempotency, freshness, permission scope, and conflicts before replay.
- Report configured, reachable, authenticated, authorized, and task-verified as separate states.
- Adapter failures should not disable unrelated local modules.

## Risk boundaries

- R0 read-only inspection: allowlisted operations only.
- R1 reversible local writes: bounded workspace and audit record.
- R2 external side effects (contact, publish, submit, payment, remote mutation): per-action human confirmation.
- R3 privileged/destructive actions (merge, deploy, delete, elevation, credential/security changes, process termination): explicit specific approval immediately before action.
- No arbitrary remote shell, silent elevation, public listener by default, automatic complaint submission, or automatic deployment.

## Module contract

Each module declares version, owner, purpose, inputs/outputs, data classification, requested capabilities, local/offline behavior, consent/retention, failure modes, tests, human approval points, and outcome metrics. The family billing workflow is one module; it must keep sensitive case records private and must not promise legal outcomes that current law/funding do not guarantee.

## Integration evidence

| Component | Evidence required before claiming connected |
|---|---|
| GitHub | successful scoped API operation with repository reference |
| Journal | tests for append, recovery, malformed lines, duplicate replay, and stale revisions |
| Local worker | loopback health plus authenticated task round-trip |
| Ollama / Digital Brain | observed local request/response with model identity and timeout behavior |
| Orchestrator | task correlation ID and observable success/failure result |
| Dashboard | status derived from live observations and timestamps |
| Browser/desktop | authorized scope and evidence for each performed action |
| Worker legion | deterministic simulation tests first; distinct process evidence before calling workers live |
| Mission module | contract tests, privacy review, permission boundaries, and retention rules |

## Release gates

Require tests for offline restart, duplicate replay, corruption, stale evidence, conflict, timeout, capability denial, resource limits, cancellation, and sensitive-data leakage. Unknown or conflicting evidence abstains. A majority vote cannot override mandatory failure. Every consequential decision must retain its rationale and evidence references.

## Relationship to existing artifacts

- `HEAVENZFIRE-BRIDGE-ARCHITECTURE.md`: bridge staging and local-worker scope.
- `UF-TCP-SPEC.md` and `uf-tcp-policy.cjs`: ternary policy concepts and deterministic evaluator.
- `uf-topology.cjs`: deterministic PLAN_ONLY topology proposal.
- `uf-bridge-journal.cjs`: offline journal state and replay primitives.
- `uf-worker-legion-sim.cjs`: bounded logical-worker simulation, explicitly not live execution.
- `UF-MULTISCALE-GYROID-WORKER-FABRIC.md`: scale tiers, graph mapping, logical epoch/phase analogy, and resource controller.
- `FAMILY-MEDICAL-BILLING-ACCOUNTABILITY-KIT.md`: one privacy-first mission workflow.

The next integration step is to add contract tests that verify the task envelope and state machine across these components, then wire the dashboard to observed registry data. Do not claim end-to-end connection until a Windows integration run produces inspectable evidence.