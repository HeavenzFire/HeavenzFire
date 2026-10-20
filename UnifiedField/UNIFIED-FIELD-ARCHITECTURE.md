# Unified Field: Federated Repository Architecture

## Core definition

The Unified Field is the coordinated system formed by HeavenzFire's repositories, local runtimes, agents, extensions, and research projects. It is **not** a claim that all code lives in one repository. Each repository remains an independently versioned component; the Unified Field supplies the shared contracts, capability registry, integration adapters, evidence trail, and cross-component verification.

## Integration invariants

1. **Repository identity is explicit.** Every registered component has an owner/repository URL, default branch when known, role, integration status, and evidence pointer.
2. **No blind bulk merge.** Upstream projects and large forks are not copied wholesale or modified merely because they are in the ecosystem. Integrate through narrow adapters, pinned revisions, and license review.
3. **Approval precedes consequential execution.** New cross-repository tasks begin as `proposed` / `pending`; execution-capable actions require an explicit approval transition.
4. **Evidence travels with tasks.** Every state change should retain task ID, actor, timestamp, result, and references to tests/logs/commits. A successful component test is not proof of end-to-end integration.
5. **Least privilege and local-first defaults.** Connectors must declare permissions, data movement, network needs, and rollback. Secrets and personal data must not be copied into public manifests or model prompts.
6. **No unsupported status claims.** `discovered`, `reviewed`, `adapter_proposed`, `adapter_implemented`, and `verified` are distinct states. Mark a component `verified` only when a reproducible integration test proves the specific path.
7. **Failure is contained.** Timeouts, malformed messages, missing capabilities, policy blocks, and unavailable services must yield explicit error/review states rather than silent success.

## Initial component map (not yet exhaustive)

| Component | Known role / evidence | Current integration status |
|---|---|---|
| `HeavenzFire/HeavenzFire` | Public project hub and this shared contract PR | Registry/contract home; cross-repository end-to-end verification pending |
| `HeavenzFire/OpenSourceAIHub` | README describes local Ollama inventory, health checks, and Solver → Orchestrator → Reviewer → Synthesizer handoff | Adapter proposed in [draft PR #1](https://github.com/HeavenzFire/OpenSourceAIHub/pull/1); server and pipeline syntax checks passed and 11 contract/API/pipeline-boundary tests passed on the connected Windows PC; live end-to-end cycle and cross-process transport remain unverified |
| `HeavenzFire/UnifiedCodebase` | Repository exists; README was not found on default branch during this pass | Discovery only; role and contents require inspection |
| `HeavenzFire/ollama` | Ollama source fork/repository | Upstream/runtime dependency; do not treat as HeavenzFire-authored runtime without file-level provenance |
| `HeavenzFire/llama.cpp` | llama.cpp source fork/repository | Inference backend dependency; integrate through documented interfaces |
| `HeavenzFire/Qwen-AgentJC` | Agent-related repository | Candidate agent/capability component; interface and license review pending |
| `HeavenzFire/MicrosoftEdge-Extensions` | Browser-extension repository | Candidate user-approved browser integration; permissions and message schema review pending |
| `HeavenzFire/EntangledMultimodalSystem` and numbered variants | Multiple multimodal-system repositories exist | Separate components until deduplication and interface review establishes their relationship |
| `HeavenzFire/Spirit_Engine`, `HeavenzFire/spirit-angelus`, `HeavenzFire/SpiritAngelusFramework`, `HeavenzFire/5D-FRAMEWORK` | Related named framework repositories exist | Candidate research/framework components; no compatibility claim yet |

This list records only repositories surfaced during initial discovery. An inventory snapshot was added at `UnifiedField/unified-field-repository-inventory.snapshot.json`: the connector returned 100 repository names at offset 0 and zero at offset 100, but the known `HeavenzFire/OpenSourceAIHub` repository was missing from that response. The listing is therefore demonstrably incomplete; do not infer that the ecosystem contains only 100 repositories. A reliable full inventory still requires another discovery route and code-level inspection.

## Shared task contract

The `heavenzfire.shared-task.v1` record is the initial cross-component handshake. It provides a stable task ID, source, goal, status, approval state, timestamps, metadata, and evidence collection. The current module is a contract prototype. OpenSourceAIHub's R&D proposal boundary now attaches and validates task IDs, matching cycle metadata, and pending approval. The draft adapter also adds a shared task lifecycle to the loopback API-run boundary, with explicit request approval evidence, prompt-hash-only task metadata, and completed/review-required/failed outcomes. Adapter transport between independently running services and broader propagation to BrowserBridge and other components remain unimplemented.

### Required adapter interface

An adapter should declare:
- `componentId` and `componentVersion`
- supported capability names and input/output schema versions
- required permissions and whether network access is used
- `submitTask(record)`, `getTaskStatus(taskId)`, and `getEvidence(taskId)`
- bounded timeout, cancellation/rollback behavior, and explicit error mapping

Adapters must validate the schema on both ingress and egress. Never translate `pending` approval into `approved` implicitly.

## Delivery sequence

1. Build the paginated repository inventory and classify each repository by evidence, not name alone.
2. Select the smallest useful vertical slice: shared task contract → Unified Field orchestrator → OpenSourceAIHub local service → evidence report.
3. Add a contract adapter at each boundary; keep all task IDs stable across hops.
4. Test approval gating, timeout, duplicate delivery, malformed payload, secret redaction, and component-unavailable paths.
5. Publish a traceable integration report with exact commits and test commands.
6. Add browser extensions, research agents, and additional runtimes incrementally behind the same interface.
7. Expand coverage until every accessible repository has a recorded disposition: integrated, dependency-only, archived, duplicate, incompatible, or not yet reviewed.

## Current truth

The shared contract module and its unit tests exist on the associated draft PR branch. Local tests previously reported 25 passing tests for a selected component batch. The new contract is not yet proven to propagate across repositories, and the ecosystem is not yet end-to-end unified.
