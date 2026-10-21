# HeavenzFire Environment Fabric

**Status:** implementation proposal on `feat/unified-environment-fabric`; not yet merged or end-to-end verified.

## Goal

Connect the Unified Field's GitHub repository, Codespaces/devcontainer, local PowerShell CLI, IDE, isolated micro-sandboxes, and external repositories through explicit, reviewable contracts. The fabric is a control-plane registry and adapter contract; it is not itself an OS/container security boundary.

## Topology

- **Control plane:** `unified-field/env-fabric.mjs` reads and validates the versioned environment manifest.
- **Micro-sandbox:** a bounded execution unit with an immutable ID, declared runtime, workspace boundary, resource/time limits, network policy, capabilities, and evidence output. A manifest entry is metadata only; it does not create isolation.
- **Execution backends:** separate adapters may target GitHub Actions runners, GitHub Codespaces, local processes, or a future container/VM runtime. Each backend must declare its actual isolation guarantees and must fail closed when a requested guarantee is unavailable.
- **External environments:** separate repositories/services remain independently versioned. Connect them only through pinned revisions, narrow adapters, schema validation, explicit permissions, and health/evidence checks.
- **CLI:** validate, list, and graph commands provide a common inspection surface. Execution/dispatch is intentionally not implemented by this initial slice.
- **IDE:** VS Code-compatible devcontainer and Codespaces configuration provide a repeatable development environment. The IDE is a client, not an authority boundary.
- **Research lane:** quantum simulation and quantum-inspired algorithms run as ordinary bounded experiments; claims about physical quantum effects require separate experimental evidence.

## Security invariants

1. Default to no outbound network from sandboxed workloads. A future adapter must enforce an explicit destination allowlist outside the worker process.
2. Do not place tokens, keys, personal data, or credentials in manifests, logs, task prompts, or committed files.
3. A task remains `proposed` / `pending` until a human approval record authorizes a specific action. Approval and execution are separate transitions.
4. Never interpret registry metadata as proof of isolation, authentication, consent, or authorization.
5. Bound runtime, CPU/memory where the backend supports it, output size, retries, and concurrency. Report unsupported limits rather than silently ignoring them.
6. Record task ID, manifest version, backend identity, pinned source revision, timestamps, exit status, artifact hashes, and evidence references.
7. Use separate branches and pull requests; never bulk-copy external repositories or merge unreviewed agent output.
8. Failure states are explicit: `blocked`, `unavailable`, `timed_out`, `failed`, or `review_required`. A health endpoint alone is not end-to-end verification.

## Current micro-sandbox contract

The example manifest at `UnifiedField/sandboxes/manifest.example.json` defines three **profiles**, not live sandboxes:

- `docs-check`: repository-local read-only validation.
- `quantum-sim`: bounded simulation experiments with no network access.
- `adapter-contract-test`: schema/contract testing for external adapters.

The initial CLI checks structural validity, unique IDs, supported statuses, limits, and required fields. It does not spawn workers, containers, VMs, cloud resources, or autonomous agents.

## Development environment

The root `.devcontainer/devcontainer.json` is intended for GitHub Codespaces and VS Code Dev Containers. It installs no third-party runtime dependencies beyond the declared Node.js development feature. Local Windows operators may continue to use PowerShell 5.1-compatible scripts; this Node-based CLI runs with Node.js 18+.

## Delivery stages

1. **Registry/contract (this slice):** versioned manifest, validation CLI, tests, devcontainer, CI.
2. **Backend adapters:** implement one backend at a time; prove isolation and egress restrictions with adversarial tests.
3. **Cross-repository links:** pinned revisions, adapter health, task/evidence propagation, timeout and duplicate-delivery tests.
4. **IDE surface:** display environment status and evidence from the same registry; never fabricate live status from static metadata.
5. **Research integration:** add reproducible quantum-simulation benchmarks and classical baselines as isolated workloads.

## Acceptance criteria for this slice

- `node unified-field/env-fabric.mjs validate` exits 0 for the example manifest.
- `node --test unified-field/env-fabric.test.mjs` passes valid, duplicate-ID, invalid-limit, and unsupported-status cases.
- `node unified-field/env-fabric.mjs list` lists profiles without claiming they are running.
- CI executes validation and tests on pull requests.
- No execution, cloud provisioning, secret transfer, or live sandbox is claimed.
