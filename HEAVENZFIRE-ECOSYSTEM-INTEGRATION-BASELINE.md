# HeavenzFire Ecosystem Integration Baseline

**Status:** Initial evidence-based integration plan  
**Created:** 2026-10-19  
**Branch:** `heavenzfire/ecosystem-integration-baseline-2026-10-19`  
**Purpose:** Coordinate the HeavenzFire repository ecosystem without overwriting existing work or treating unverified claims as completed engineering.

## Operating rules

1. **Evidence before claims.** A repository, README, diagram, or design assertion is not proof that a service is deployed or a result independently reproduced.
2. **Preserve first.** Integrate through branches, additive files, tests, and pull requests. Do not bulk-rewrite or delete repositories as a first step.
3. **Local-first, least privilege.** Local execution should use scoped capabilities, explicit approvals for privileged/destructive actions, bounded timeouts, and an append-only audit trail.
4. **Human control.** No silent deployment, credential collection, security weakening, or destructive operation. Require explicit approval for high-impact changes.
5. **Reproducibility.** Each claimed capability should have a test, exact command, expected result, and recorded environment.
6. **Provenance.** Preserve original authorship and upstream licenses. Forked upstream projects are dependencies, not original HeavenzFire inventions.
7. **Separate measured facts from hypotheses.** Quantum, compression, latency, security, scale, and formal-verification claims remain unverified until an artifact and reproducible test substantiate them.

## First-pass repository map

These entries were checked through the authenticated GitHub connector on 2026-10-19. This is a starting map, not a complete audit of every repository.

| Repository | Observed evidence | Initial integration role | Next verification |
|---|---|---|---|
| `HeavenzFire/HeavenzFire` | Root contains README, project charter, PowerShell utilities, Python modules, tests, and multiple subdirectories. | Coordination hub and evidence index. | Identify authoritative packages, inspect workflows, run existing tests in a controlled environment. |
| `HeavenzFire/Sovereign-Node-` | TypeScript/Express server, Vite frontend, package lock, source/tooling directories. | Candidate node/service API. | Inspect routes, authentication, input validation, tests, build and runtime behavior. |
| `HeavenzFire/The-Pantheon-of-Neural-Intelligence-` | TypeScript server (large), React/Vite dependencies, Google GenAI integration, Ollama and OpenAI-compatible provider branches in inspected source excerpt. | Candidate model/provider gateway and interface. | Audit provider routing, API key handling, authentication, CORS, request limits, and error paths. |
| `HeavenzFire/Syntropic-Kernel-Code-Explore` | React/Vite application with a large constants file; README describes an AI Studio app. | Candidate visualization/research UI; computational claims require separate evidence. | Inspect actual algorithms, inputs, outputs, and testability. |
| `HeavenzFire/ollama` and `HeavenzFire/llama.cpp` | Repository names indicate upstream projects or forks; names alone do not establish modifications or authorship. | Potential dependencies only after provenance and diff review. | Compare upstream, license, patches, and local build instructions. |

## Target architecture

```text
Phone / Chat interface
        |
        v
Task planner and repository registry
        |
        +--> GitHub adapter (authenticated, scoped operations)
        +--> Research adapters (search, paper retrieval, citations)
        +--> Web automation adapter (separate browser/session boundary)
        +--> Local execution adapter (offline until the device is verified online)
        |
        v
Policy gate: scope + risk classification + approval
        |
        v
Task runner: timeout, bounded retries, idempotency, cancellation
        |
        v
Evidence ledger: inputs, actions, exit status, hashes, outputs, timestamps
```

The phone can currently orchestrate cloud-side GitHub and research work through available authenticated connectors. It cannot directly execute commands on the Windows computer while its Desktop Commander device is reported offline. Do not mark local deployment complete until a real command returns verifiable output.

## Integration workstreams

### A. Repository inventory and provenance
- Enumerate all accessible repositories in pages and record default branch, permissions, visibility, last update, language, size, license, workflows, and test commands where available.
- Classify each repository as: maintained application, library/dependency, experiment, documentation/evidence, duplicate/template, or dormant/unknown.
- Record relationships without moving or deleting repositories.
- Identify secret-like files and exposed credentials for careful review; never copy secret values into this registry.

### B. Shared contracts
Define small, versioned contracts before connecting services:
- `TaskRequest`: task ID, goal, scope, requested capabilities, risk tier, approval reference.
- `ToolResult`: tool ID, status, start/end time, exit status, bounded output, artifact references.
- `EvidenceRecord`: task ID, action, repository/ref, input/output hashes where applicable, result, timestamp.
- `AgentManifest`: agent ID, capabilities, health check, dependencies, model/provider, resource limits.
- `RepositoryRecord`: full name, default branch, role, ownership/provenance, tests, CI status, evidence status.

Schemas should be validated and versioned; do not let a free-form model response directly grant permissions.

### C. Execution safety
- Default to read-only inspection.
- Use explicit allowlists for paths, commands, repositories, and network destinations.
- Require separate approval for administrator access, credential changes, external publication, destructive filesystem operations, and production deployment.
- Keep secrets in environment variables or a secret store; redact them from logs.
- Use timeouts, output limits, cancellation, and a per-task working directory.
- Test with synthetic fixtures before touching user data.
- Record failed and denied actions as well as successful actions.

### D. Verification and delivery
Every integrated component must have:
1. A documented purpose and boundary.
2. Reproducible setup instructions.
3. Unit/integration tests appropriate to its risk.
4. A health check that verifies the dependency, not just process existence.
5. CI evidence or a clearly stated reason CI could not run.
6. A rollback or recovery procedure.
7. A limitations section distinguishing implemented behavior from planned behavior.

## Priority sequence

1. Complete repository inventory and provenance map.
2. Inspect the existing core, node, and model gateway before designing replacements.
3. Add shared contracts and a machine-readable repository manifest.
4. Implement a minimal approval-first task runner against a mock adapter.
5. Add GitHub operations with narrow scopes and dry-run support.
6. Restore and verify the local Windows bridge; then add local PowerShell execution.
7. Connect research/browser adapters through explicit interfaces.
8. Integrate other repositories only after their role, tests, and dependencies are known.
9. Publish a verification report with pass/fail evidence, open risks, and reproducible commands.

## Initial acceptance criteria

- [ ] All accessible repositories inventoried with pagination and a recorded timestamp.
- [ ] No existing repository or branch overwritten by the integration effort.
- [ ] Core architecture and repository ownership/provenance documented.
- [ ] Shared request/result/evidence schemas validated by tests.
- [ ] Task runner rejects unapproved high-risk actions.
- [ ] Logs redact secrets and preserve failure evidence.
- [ ] CI passes for the initial integration branch, or failures are documented with logs.
- [ ] Local execution is marked unavailable until a real device command succeeds.
- [ ] Every public technical claim links to a reproducible artifact or is explicitly labelled as a hypothesis/roadmap item.

## Evidence and limitations

This document records an initial connector-based inspection of selected repository metadata, root contents, package manifests, README, project charter, and a portion of one server file. It does **not** establish that the full repository fleet has been audited, that applications build, that endpoints are secure, or that any large-scale deployment or novel scientific claim has been independently verified.

Update this document as evidence is collected. Prefer concrete commit links, workflow runs, test logs, benchmark fixtures, and hashes over promotional summaries.
