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
| `HeavenzFire/OpenSourceAIHub` | README describes local Ollama inventory, health checks, and Solver → Orchestrator → Reviewer → Synthesizer handoff | Adapter proposed in [draft PR #1](https://github.com/HeavenzFire/OpenSourceAIHub/pull/1); server, pipeline, and inbox syntax checks passed; 20 combined contract/API/pipeline/inbox/transport tests passed on the connected Windows PC, including a cross-repository proposal-delivery smoke test; GitHub CI and a full live R&D cycle remain unverified |
| `HeavenzFire/UnifiedCodebase` | Repository exists; README was not found on default branch during this pass | Discovery only; role and contents require inspection |
| `HeavenzFire/ollama` | Ollama source fork/repository | Upstream/runtime dependency; do not treat as HeavenzFire-authored runtime without file-level provenance |
| `HeavenzFire/llama.cpp` | llama.cpp source fork/repository | Inference backend dependency; integrate through documented interfaces |
| `HeavenzFire/Qwen-AgentJC` | Agent-related repository | Candidate agent/capability component; interface and license review pending |
| `HeavenzFire/MicrosoftEdge-Extensions` | Browser-extension repository | Candidate user-approved browser integration; permissions and message schema review pending |
| `HeavenzFire/EntangledMultimodalSystem` and numbered variants | Multiple multimodal-system repositories exist | Separate components until deduplication and interface review establishes their relationship |
| `HeavenzFire/Spirit_Engine`, `HeavenzFire/spirit-angelus`, `HeavenzFire/SpiritAngelusFramework`, `HeavenzFire/5D-FRAMEWORK` | Related named framework repositories exist | Candidate research/framework components; no compatibility claim yet |

This list records only repositories surfaced during initial discovery. An inventory snapshot was added at `UnifiedField/unified-field-repository-inventory.snapshot.json`: the connector returned 100 repository names at offset 0 and zero at offset 100, but the known `HeavenzFire/OpenSourceAIHub` repository was missing from that response. The listing is therefore demonstrably incomplete; do not infer that the ecosystem contains only 100 repositories. A reliable full inventory still requires another discovery route and code-level inspection.

## Shared task contract

The `heavenzfire.shared-task.v1` record is the initial cross-component handshake. It provides a stable task ID, source, goal, status, approval state, timestamps, metadata, and evidence collection. The current module is a contract prototype. OpenSourceAIHub's R&D proposal boundary attaches and validates task IDs, matching cycle metadata, and pending approval. Its draft adapter optionally POSTs only proposed/pending records to the core's loopback-only `task-inbox-server.cjs`; the inbox validates records, persists JSONL, and handles duplicate delivery idempotently without executing proposals. The draft also adds a shared task lifecycle to the loopback API-run boundary, with explicit request approval evidence, prompt-hash-only task metadata, and completed/review-required/failed outcomes. BrowserBridge and other component adapters remain pending.

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

The shared contract, loopback-only core task inbox, OpenSourceAIHub proposal transport adapter, API-run lifecycle, and deterministic tests exist on draft PR branches. On the connected Windows PC, server/pipeline/inbox syntax checks passed and a combined batch passed 20 tests, including a cross-repository delivery test using the actual adapter and inbox modules. A separate isolated loopback smoke test confirmed the Hub health route and rejection of an invalid run request (HTTP 400). The GitHub Actions workflows are committed but no CI result has yet been confirmed. The persistent core inbox has not been launched as a long-running service, the valid four-stage inference path has not been executed in this verification pass, and the entire repository ecosystem is not yet end-to-end unified.
