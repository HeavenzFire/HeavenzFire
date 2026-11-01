# Upstream Agent Systems — Adoption and Integration Plan

**Status:** discovery and architecture review recorded; no upstream forks or runtime integrations are claimed.
**Baseline checked:** 2026-10-31
**Owner/control plane:** `HeavenzFire/HeavenzFire`
**Working branch:** `integration/upstream-agent-systems-2026-11`

## Objective

Evaluate four established agent systems as independently versioned components of the HeavenzFire Unified Field. Preserve upstream provenance and project licenses. Reuse capabilities through bounded adapters and explicit contracts rather than copying entire runtimes into the core repository.

## Repository candidates

| Candidate | Upstream repository | Pinned inspection revision | Observed project focus | License evidence | Disposition |
|---|---|---|---|---|---|
| OpenFang | [RightNow-AI/openfang](https://github.com/RightNow-AI/openfang) | [acf2587](https://github.com/RightNow-AI/openfang/commit/acf2587e46be174c10200489c9a2d23a39a98aeb) | Rust agent operating system; autonomous scheduled agents and bundled capability packages | GitHub repository metadata reports Apache-2.0, while the README badge reports MIT; a root `LICENSE` file was not found at inspection. **Conflict unresolved — do not fork/import until reconciled with upstream.** | Discovery; license gate blocked |
| SwarmClaw | [swarmclawai/swarmclaw](https://github.com/swarmclawai/swarmclaw) | [ed38ba5](https://github.com/swarmclawai/swarmclaw/commit/ed38ba5329c20e48c03b4a4028f4a76a1a75e2d1) | Self-hosted multi-agent runtime; agent memory, MCP tools, skills, delegation, schedules, multiple model providers | Root LICENSE inspected; MIT | Candidate for isolated adapter spike after dependency and security audit |
| Orloj | [OrlojHQ/orloj](https://github.com/OrlojHQ/orloj) | [00091ac](https://github.com/OrlojHQ/orloj/commit/00091ac69b8f72a20969e7b02a73248b075125f2) | Declarative agent infrastructure; worker lifecycle, handoffs, retries, policy/approval, observability, deployment | Root LICENSE inspected; Apache-2.0 | Strong candidate for control-plane contract and governance comparison |
| Agent Zero | [agent0ai/agent-zero](https://github.com/agent0ai/agent-zero) | [ff2a5b9](https://github.com/agent0ai/agent-zero/commit/ff2a5b9c9c4e490ba38dd7c313e779510bb2071a) | Agent framework with Dockerized Linux desktop, browser/GUI tools, projects, plugins, memory and subagents | Root LICENSE inspected; MIT. GitHub metadata returned NOASSERTION, so retain the actual LICENSE text and recheck on import. | Candidate for sandboxed tool/desktop adapter after threat-model review |

The table records upstream README claims as discovery evidence, not independently validated runtime behavior. Recheck each pinned revision before importing; upstream default branches may move.

## Fit with existing Unified Field contracts

The existing architecture in [UnifiedField/UNIFIED-FIELD-ARCHITECTURE.md](../UnifiedField/UNIFIED-FIELD-ARCHITECTURE.md) requires versioned adapters, explicit permissions, pending-by-default task approval, evidence references, and independent integration tests.

Use the existing shared task contract and loopback task inbox as the only initial integration boundary. Each adapter must:

- declare component ID/version, upstream repository, pinned commit, license, and source provenance;
- declare input/output schema versions and supported capabilities;
- declare permissions, data egress, network access, secrets use, and execution isolation;
- submit only `proposed` / `pending` task records by default;
- never translate a pending task into approval or execute it as a side effect of import;
- provide bounded timeouts, cancellation behavior, explicit error mapping, and auditable evidence;
- have independent tests for malformed input, duplicate delivery, timeout, denied permission, unavailable runtime, and secret redaction.

## Integration sequence

1. **Provenance and license gate.** Reconcile OpenFang's conflicting license signals. Capture license files and notices for every selected revision. Confirm whether each upstream project permits the intended fork, modification, redistribution, and bundled dependencies.
2. **Fork creation.** Create a GitHub fork under the user's account only after the license gate passes. Preserve upstream default branch and commit ancestry. Do not rename or replace the upstream project.
3. **Isolated reproducibility.** Pin the fork to the inspected upstream SHA; install only in a disposable, non-privileged environment. Record exact setup commands, dependency lockfiles, tests, network endpoints, and resource requirements. Do not run unreviewed install scripts on the user's workstation.
4. **Capability mapping.** Map each candidate to the shared task contract and capability registry. Identify overlap with existing local orchestrator, inbox, model runtime, and policy gate before writing an adapter.
5. **Minimal adapter spike.** Start with read-only status/capability discovery and proposal submission. No autonomous task execution, host filesystem access, browser control, or external side effects in the first slice.
6. **Adversarial verification.** Test authorization bypass, prompt/tool injection boundaries, SSRF/egress, secret exposure, container escape assumptions, replay, duplicate tasks, and shutdown behavior.
7. **Integration decision.** Promote only components with reproducible passing tests and acceptable license/security review. Keep rejected or redundant projects as documented research references.

## Priority order

- **Orloj:** first architecture comparison because its declarative policies, approval resources, durable handoffs, worker lifecycle, and observability map closely to the Unified Field governance contract.
- **SwarmClaw:** second; evaluate agent memory, delegation, model-provider adapters, MCP integration and scheduling against existing local orchestration.
- **Agent Zero:** third; evaluate isolated desktop/browser execution as an optional sandboxed worker, not as a privileged host controller.
- **OpenFang:** defer fork/import until the license discrepancy is resolved. Then compare its autonomous agent packages and runtime boundary.

This is a proposed evaluation order, not a claim that any component has been integrated or verified.

## Current execution record

- Verified repository identities and public default branches through GitHub repository metadata.
- Inspected upstream README content for all four candidates.
- Inspected root license content for SwarmClaw, Orloj, and Agent Zero. OpenFang license evidence conflicts and remains blocked.
- Recorded pinned default-branch commit SHAs for reproducible follow-up.
- Created this documentation branch from `main`.
- **No forks created:** the connected GitHub actions available in this session support repository inspection and file/branch/PR operations but do not expose a fork-creation operation. No fork was simulated or represented as complete.
- **No software installed, executed, or imported.** No integration tests have been run because no candidate runtime has been integrated.

## Acceptance criteria

A candidate is not considered adopted until its HeavenzFire fork exists, the license and provenance are recorded, the selected commit is pinned, a minimal adapter is implemented, and isolated plus integration tests pass. A successful fork alone does not mean the candidate is part of the operational Unified Field.
