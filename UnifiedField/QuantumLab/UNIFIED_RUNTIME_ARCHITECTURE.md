# Unified Field — Runtime Contract

**Status checked:** 2026-10-21  
**Purpose:** One local inference path, one task dispatch surface, observable results, and a resource-aware execution policy.

## Canonical runtime path

```text
Digital Brain (8797) ─┐
Orchestrator (8788) ─┼─> AI Gateway (11800) ─> llama.cpp runtime (11801)
Legacy gateway (8787) ┘

Unified Field Dashboard (8800) ─> Mesh Bridge (8081) ─> model/hash task queue
                                  └─> Task Inbox (18796) [approval-first proposal store]
```

All services bind to loopback. The primary inference endpoint is the llama.cpp server on `127.0.0.1:11801`, serving `heavenzfire-qwen-0.5b`. The AI gateway on port 11800 defaults to the OpenAI-compatible backend at port 11801. The compatibility gateway on port 8787 forwards to the same runtime. Avoid routing these paths back through Ollama by default: the 1.2B compatibility model consumed enough RAM to block model tasks on this 7.42-GiB machine.

## Verified acceptance checks

- Direct orchestrator task returned the requested token: `UNIFIED_ORCHESTRATOR_PASS`.
- Orchestrator task after unloading the legacy Ollama model returned `UNIFIED_ORCHESTRATOR_AFTER_UNLOAD_PASS`.
- Mesh model task returned `UNIFIED_FIELD_MODEL_TASK_PASS` and reached `completed`.
- Deterministic mesh hash task completed and produced a SHA-256 digest.
- Digital Brain test-canary memory filter returned `DIGITAL_BRAIN_MEMORY_FILTER_OK`.
- Dashboard health API reported 31/31 configured probes healthy.
- After unloading the legacy Ollama model, `/api/ps` reported zero loaded models and Windows reported about 1.66 GiB free RAM (snapshot, not a permanent guarantee).

## Operational rules

1. Do not equate endpoint health with successful task execution. Preserve task IDs, terminal states, results, errors, and acceptance-test evidence.
2. Keep only one primary reasoning model resident by default. Before any second model load, check available RAM; do not bypass the existing 1-GiB model-task admission guard.
3. The 16 ports 18111–18126 currently answer health probes reporting the same `HeavenzFire-ENHANCED-DUAL` service family. Treat them as configured worker endpoints, **not** as proof of 16 independent reasoning instances or completed delegation.
4. The task inbox on port 18796 stores proposed tasks in `proposed/pending` state. It is not yet proven to auto-dispatch approved inbox tasks to the mesh.
5. The dashboard’s 31/31 result is an endpoint-health snapshot, not an end-to-end system certification.

## Next integration target

Implement an explicit, approval-aware adapter between the proposal inbox (18796) and mesh dispatcher (8081). Preserve the inbox's proposed/pending invariant; execution should require a separate authorized approval transition, then record the mesh task ID and final result back against the original task. Add tests for duplicate submissions, denied/unapproved dispatch, timeout, worker failure, and result reconciliation before enabling automatic handoff.
