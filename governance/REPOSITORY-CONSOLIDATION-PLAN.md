# HeavenzFire Repository Consolidation — Control Plan

**Status:** Phase 0 inventory catalog committed to a review branch; no source repositories modified.

## Verified inventory snapshot

- Unique repositories returned by GitHub search `user:HeavenzFire`: **277**.
- Snapshot date: 2026-10-22.
- Catalog file: [repository-inventory-2026-10-22.json](repository-inventory-2026-10-22.json)
- This is a search-derived inventory, not yet certified exhaustive; verify against the full owner repository list and search/API pagination before making completeness claims.
- Repository categories are heuristic labels from names only. They are not findings about implementation quality or functionality.

## Consolidation rule: preserve first, merge selectively

Do **not** combine all repositories into one monorepo by blindly copying files. The catalog may contain upstream forks, third-party mirrors, generated shells, archives, distinct products, licensed dependencies, and experimental projects. Blind merging would risk losing history, violating licenses, leaking secrets, breaking builds, or overwriting independent work.

## Phases and acceptance gates

1. **Inventory (this change):** list repositories, default branches, visibility, archive status, approximate GitHub size, permissions, and explicit review classifications.
2. **Evidence scan:** for each repo, inspect README, manifest/build files, license, recent commit, open PRs/issues, workflow status, secrets-risk indicators, and test coverage. Do not clone huge dependencies by default.
3. **Deduplicate and map:** compare Git object history, file hashes, package identities, and dependency relationships. Mark forks/upstreams and generated duplicates separately.
4. **Choose canonical homes:** select a small set of domain repositories (Unified Field control plane, runtime/agents, security/governance, dashboards, research/simulations, archive/evidence). Keep unique standalone products where justified.
5. **Migrate by pull request:** preserve original repos and history; add compatibility shims/submodules/subtrees or explicit import commits where appropriate. No deletion, mass rename, archive, license change, or default-branch rewrite without explicit approval.
6. **Verify each migration:** build/test, secret scan, license review, path-collision report, history/provenance record, CI evidence, and rollback instructions.
7. **Cut over only after acceptance:** update canonical links and READMEs, then consider archiving obsolete duplicates only after an explicit review.

## Initial work queues

- **Core / platform candidates:** `HeavenzFire`, `HeavenzFire-Core-System-1`, `HeavenzFire-Sovereign-Node`, `Sovereign-Node-`, `HeavenzFire-Omni-Substrate-Node`, `UnifiedCodebase`, `SpiritAngelusFramework`, `Spirit_Engine`, `spirit-angelus`, `IBEN-Genesis`.
- **Agent / orchestration candidates:** `Neural-Swarm-Orchestrator`, `Neural-Mesh-Orchestrator`, `Qwen-AgentJC`, `Agentic-Full-Stack-Engineer`, `Autonomous-R-D`, `S.A.N.A-Syntropic-Autonomous-Neural-Architecture`.
- **Security / governance candidates:** `STRATUM-0-Adversarial-Integrity-Monitor`, `Verifier-Mesh-Command-Center`, `Public-Transparency-Portal`, `Entropy-Shield-System-Augmentation-Nexus`, `HeavenzFire-Reclamation-Command`, `HEAVENZFIRE-ECOSYSTEM-AUDIT`.
- **Dashboard / interface candidates:** `HeavenzFire-Dashboard`, `GuardianOS-Dashboard`, `Syntropic-Command-Horizon`, `Syntropic-Agent-Dashboard`, `Project-HeavenzFire-Tech-Audit-Dashboard`, `SOVEREIGN-STACK-DASHBOARD`.
- **Research / simulation candidates:** `Syntropic-Kernel-Code-Explore`, `Ternary-Cellular-Automaton-Simulator`, `Quantum-Interplay`, `The-Tesla-Hulse-Resonance-Field-Grid`, `DigitalPowerStationFramework`.
- **Upstream / dependency review:** repositories named after established upstream projects must be checked for fork status, upstream remotes, license, local patches, and divergence before any integration.

These groups are initial review queues inferred from names, not approved migration decisions. The JSON catalog is the source of record for the full list.

## Safety / preservation invariants

- Never delete, overwrite, or archive source repositories during initial consolidation.
- Never copy credentials, private keys, access tokens, or local machine state into the public catalog.
- Do not claim tests pass unless an actual workflow or local test run is observed.
- Preserve original commit history and authorship where feasible.
- Every migration must be reversible and tracked by source SHA, target SHA, file map, and test evidence.
- Keep the control plane modular and local-first; avoid forcing unrelated products into a single release cycle.

## Immediate next task

Run a ranked, read-only content audit over the highest-value candidate repositories first, using bounded GitHub metadata and README/build/test/license inspection. Produce a dependency graph and canonical-repository proposal before any code migration.
