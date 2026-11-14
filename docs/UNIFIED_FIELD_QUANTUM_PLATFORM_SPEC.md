# Unified Field Quantum Platform — Integration Specification

Status: draft architecture contract; no quantum hardware connection or quantum advantage is claimed.

## 1. Objective

Unify the existing HeavenzFire Unified Field control plane with the repository's quantum-related software into one consumer-accessible platform. The platform must distinguish classical simulation, hardware emulation, and execution on a physical quantum processor in both APIs and user interfaces.

The first deliverable is a locally runnable, reproducible quantum experiment workflow. Physical hardware access is a later provider-adapter capability and requires supported credentials, provider terms, and explicit operator configuration.

## 2. Verified starting points

The following existing artifacts were located on the repository default branch during this integration review:

- `UnifiedField/quantum/soft_bowl.py` and `UnifiedField/quantum/README.md`: finite-difference numerical solution of a one-dimensional quantum harmonic oscillator, with normalization and energy-spectrum checks. The README explicitly identifies it as a classical numerical simulation, not a quantum processor or hardware connection.
- `throne-infra/70M_INFRA/qiskit_stub.py`: small Qiskit Aer example that creates a three-qubit circuit, applies Hadamard gates, measures, and runs shots. Treat this as a starter example, not a complete platform.
- `quantum_sacred_geometry.py`: Qiskit circuit / Statevector-based research code; review its tests, dependencies, semantics, and claims before adopting it.
- `UnifiedField/QuantumLab/UnifiedField-Dashboard-Server.cjs`: local dashboard and existing task/worker/journal integrations that may provide an operator-facing integration point. Do not assume every listed endpoint is running or secure merely because it appears in source.
- `UnifiedField/QuantumLab/uf-bridge-journal.cjs` and `uf-local-worker.cjs`: existing task journal and local worker patterns to reuse only through their documented contracts and security gates.
- `unified-field/modules.json`: currently registers `quantum-interplay` and `quantum-alchemy` as disabled candidate adapters. Preserve source provenance and their disabled status until review, tests, dependency/license checks, and explicit activation criteria are satisfied.

## 3. Core architecture

Keep the quantum execution engine independent from the AI orchestrator. The orchestrator may draft experiments, explain results, and propose parameter sweeps. The quantum service owns schema validation, resource admission, simulation, result generation, and provenance. AI-generated requests never bypass these controls.

### Components

1. **Consumer interface** — circuit builder, experiment templates, run history, accessible explanations, and export.
2. **Quantum API / job manager** — versioned circuit and experiment schemas; validates inputs; assigns job IDs; enforces time, memory, qubit, shot, and queue limits.
3. **Classical circuit engine** — deterministic state-vector simulation for small circuits; density-matrix or trajectory methods for noise-aware workloads where practical.
4. **Physics models** — independent numerical modules for the harmonic oscillator baseline and, as a later milestone, transmon energy levels and driven dynamics.
5. **Compiler layer** — logical circuit validation, target topology mapping, routing, native-gate decomposition, and pulse scheduling only when a target backend has a validated calibration model.
6. **Backend adapters** — local simulators first; physical quantum-provider adapters only after provider API, credentials, job lifecycle, quotas, and data handling are reviewed.
7. **Evidence and provenance** — append-only experiment records with schema version, source revision, configuration digest, engine/backend identity, random seed where applicable, input hash, output hash, metrics, timestamps, and explicit execution class.

### Execution classes

Every job and result must carry exactly one clearly named execution class:

- `classical_simulation`: numerical computation on CPU/GPU; no physical qubits.
- `hardware_emulation`: a classical model of device physics, control pulses, noise, leakage, and readout; no physical qubits.
- `quantum_hardware`: submitted to an identified physical quantum processor; record provider, backend, job ID, and returned metadata.

Never label a classical simulation or hardware-emulation result as physical quantum execution.

## 4. Unified Field integration contract

Integrate through a narrow adapter rather than embedding quantum logic inside the orchestrator.

Suggested first API surface (names are provisional until reconciled with current route conventions):

- `GET /api/quantum/health` — service version, available execution classes, resource limits; no secrets.
- `GET /api/quantum/backends` — locally available simulator/emulator backends and explicitly configured hardware backends.
- `POST /api/quantum/jobs` — validate and enqueue a bounded experiment; idempotency key required.
- `GET /api/quantum/jobs/:id` — metadata-only job status.
- `GET /api/quantum/jobs/:id/result` — authenticated result retrieval with output-size limits.
- `POST /api/quantum/validate` — side-effect-free circuit/schema validation.

Use the existing Unified Field journal only through its public, tested interface. Do not write directly into internal journal formats from a new module. Use a dedicated quantum job-read credential distinct from task submission, execution, and result credentials. Bind listeners to loopback by default. Remote device access must use the established authenticated PeerLink/Tailscale boundary, not a newly exposed unauthenticated port.

## 5. Initial implementation sequence

### Milestone A — inventory and baseline (no new runtime behavior)

- Run the existing oscillator model and capture its JSON output.
- Inspect and run the Qiskit Aer stub in an isolated Python environment.
- Inspect the geometry circuit module and identify overlap, unsupported claims, dependencies, and missing tests.
- Record Python, NumPy, Qiskit, and Aer versions; do not silently install or upgrade packages on operator devices.
- Establish baseline CPU time, peak memory, circuit size, and output determinism.

### Milestone B — stable experiment schema and local simulator

- Add versioned JSON schema for circuits and experiment requests.
- Support a deliberately small gate set first: I, X, Y, Z, H, S, T, RX, RY, RZ, and CNOT.
- Define bit ordering, global-phase handling, measurement semantics, seed behavior, numeric precision, and unsupported-gate rejection.
- Implement a reference state-vector engine or a thin, isolated adapter to a vetted simulator; choose based on dependency/license and differential-test results.
- Add Bell-state and GHZ-state reference cases, gate inverse tests, norm preservation, measurement distribution checks, and cross-checks against Qiskit Aer when installed.
- Add explicit admission limits so mobile devices do not attempt unbounded state-vector allocations.

### Milestone C — Unified Field job adapter

- Add the quantum job service as a separate loopback process/module with health and bounded routes.
- Submit jobs through the existing authenticated task boundary using a typed allowlisted action; no arbitrary shell or Python execution.
- Require explicit operator approval before resource-intensive sweeps, remote submissions, or any external side effect.
- Persist job lifecycle and evidence using the supported journal interface; support idempotent retry and restart recovery.
- Expose job state in the dashboard without exposing prompts, secrets, or raw private data.

### Milestone D — noise and transmon modeling

- Add validated channels for depolarization, amplitude damping, and dephasing with analytical reference tests.
- Implement transmon Hamiltonian diagonalization from (H = 4E_C(\hat n-n_g)^2-E_J\cos\hat\phi), documenting basis truncation, units, convergence, and parameter domain.
- Calculate transition frequencies and anharmonicity; test convergence against increasing charge-basis truncation.
- Add driven dynamics and pulse-shape modeling only after the static spectrum is independently verified.
- Keep calibration and device-specific parameters explicitly sourced; no fabricated calibration defaults.

### Milestone E — compilation and physical hardware adapters

- Introduce target topology descriptions and mapping/routing tests.
- Implement native gate decomposition only for explicitly defined target models.
- Treat pulse-level compilation as target-specific and calibration-dependent.
- Add provider adapters only after authentication, privacy, billing/quota, job cancellation, result provenance, and failure behavior are documented and tested.
- A hardware result is valid only when tied to a provider-returned job identifier and backend metadata.

## 6. Security, safety, and resource boundaries

- Loopback-only by default; no new public listener.
- Separate credentials for submit, status, and result access; minimum 32 random bytes for bearer secrets, stored outside the repository.
- Strict request schema, body-size limits, circuit-depth limits, qubit limits, shot limits, wall-time limits, memory admission, and bounded queues.
- Reject unknown operations, custom code, arbitrary file paths, and arbitrary provider URLs.
- No secrets, personal data, or raw credentials in journals, test fixtures, or result artifacts.
- AI agents may propose jobs but cannot mint credentials, change limits, approve their own high-risk requests, or silently submit billable hardware jobs.
- Provider jobs require explicit human approval and a cost/quota estimate where the provider exposes one.
- Preserve rollback paths and avoid modifying existing Unified Field services until integration tests pass.

## 7. Acceptance criteria

The first integrated release is not complete until all of the following are demonstrated:

1. A clean documented setup runs a local Bell-state experiment without cloud access.
2. The expected ideal Bell distribution is observed within a statistically justified tolerance.
3. Circuit validation rejects malformed, oversized, unsupported, and over-budget requests.
4. Repeatable seeded runs reproduce the same simulator result where the algorithm permits deterministic replay.
5. The quantum job can be submitted through Unified Field, survives process restart, and can be queried without leaking private experiment inputs.
6. Result records identify `classical_simulation` and cannot be confused with hardware execution.
7. Unit, integration, security, and fault-injection tests pass on Windows PowerShell 5.1-compatible launch paths where applicable, plus Android/Termux where supported.
8. A separate reviewer can reproduce the result from the documented commit and commands.

## 8. Non-goals and claims discipline

- This project does not turn a CPU or Android phone into a physical quantum processor.
- State-vector simulation does not provide quantum speedup; its memory cost grows exponentially with qubit count.
- A transmon numerical model is not a calibrated device emulator until control, noise, readout, and calibration behavior are validated against appropriate reference data.
- No clinical, financial, safety-critical, or scientific conclusion should rely solely on unreviewed AI-generated analysis.
- No quantum advantage, breakthrough, or hardware capability is claimed without reproducible comparison against appropriate classical baselines and, where relevant, physical hardware evidence.

## 9. First pull-request scope

This PR establishes the integration contract only. It must not activate disabled modules, install dependencies, alter device configuration, configure secrets, deploy services, or claim physical hardware access. The next implementation PR should be Milestone A plus the smallest tested local Bell-state execution path.
