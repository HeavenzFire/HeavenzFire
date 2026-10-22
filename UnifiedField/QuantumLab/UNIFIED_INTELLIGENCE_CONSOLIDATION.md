# HeavenzFire Unified Intelligence — Consolidation Plan

**Status:** Proposed implementation contract; not a claim that local services have already been changed or that end-to-end integration is verified.  
**Branch:** `fix/historical-profile-deterministic-runtime`  
**Goal:** Present the existing local AI components as one coherent HeavenzFire entity while retaining internal capability boundaries and verifiable execution.

## Brand contract

HeavenzFire must be direct, useful, locally controlled, privacy-conscious, and evidence-led. The interface must not claim an agent is alive, that multiple independent minds are reasoning, that a tool ran, or that a task passed unless the relevant event and evidence exist.

One entity is a product and orchestration boundary—not a claim that multiple models have merged their neural weights.

## Existing documented local topology

According to the runtime contract dated 2026-10-21:

```text
Digital Brain :8797 ─┐
Orchestrator  :8788 ─┼─> AI Gateway :11800 ─> llama.cpp :11801
Legacy gateway:8787 ─┘
```

The canonical model is documented as `heavenzfire-qwen-0.5b`. All endpoints are intended to bind to loopback. The current browser UI on `:11811` is the Micro Mind Sandbox, but its exact API wiring must be inspected and tested before replacing it. Do not assume the UI port is the inference gateway.

## Unified entity boundary

Expose one user-facing assistant identity and one task lifecycle:

1. **Input:** text and, when explicitly supported, speech-to-text.
2. **Context manager:** conversation ID, active profile, bounded working context, and explicit memory policy.
3. **Planner/router:** choose a capability or role prompt; do not spawn a separate model merely to simulate a historical persona.
4. **Inference adapter:** one OpenAI-compatible local endpoint, one configured model, bounded timeout, deterministic request settings where supported.
5. **Tool executor:** allowlisted task types only; approvals required for side effects; preserve task IDs and tool outputs.
6. **Verifier:** validate outputs against a task-specific acceptance test before reporting success.
7. **Response and voice:** return the same verified text to the UI; synthesize speech only when enabled.
8. **Audit record:** structured status, timing, model, profile, error code, and acceptance result. Never log secrets or unrestricted private prompts by default.

## Memory rules

- Keep memory keyed by an opaque conversation/sandbox ID, not merely a display name.
- Historical profiles change instructions and perspective, not model weights or factual authority.
- Switching profiles may use separate memory scopes by default; shared project facts should enter a distinct, explicit project context rather than being silently copied between personal conversations.
- Reset deletes only the selected sandbox's memory and reports exactly what was cleared.
- Retrieval must be bounded and relevant; never inject arbitrary unrelated transcript history.
- If persistence is unavailable, state that memory is session-only rather than implying it was saved.

## Deterministic failure contract

Return a structured error envelope for failures. Suggested fields:

```json
{
  "ok": false,
  "error": {
    "code": "LOCAL_INFERENCE_HTTP_ERROR",
    "message": "Local inference returned HTTP 500",
    "retryable": true,
    "request_id": "opaque-request-id"
  }
}
```

Requirements:
- Distinguish connection refused, timeout, upstream non-2xx, invalid JSON, empty model response, malformed request, and rejected tool action.
- Never replace an inference failure with a fabricated or canned model answer.
- Do not blindly retry non-idempotent tool actions.
- Record latency and request correlation IDs. Redact upstream error details before showing them if they could expose local paths, secrets, or internal stack traces.
- Health checks are not task-success checks.

## Voice contract

- A successful text response is the source of truth; voice playback is a separate, observable step.
- If speech is enabled, enqueue the final assistant text once and show speaking/complete/failed state.
- If speech is disabled, do not call text-to-speech.
- TTS failure must not discard the text response.
- Voice test must report actual browser capability and playback result, not simply flip a UI status label.

## Resource policy

Keep one primary model resident. Check RAM and existing admission limits before any extra model load. Use role prompts and sequential stages over parallel model instances by default. Do not label configured worker ports as independent minds without process/model evidence.

## Acceptance suite

A merge is not considered verified until the following run locally against the actual app:

| Test | Acceptance condition |
|---|---|
| Gateway smoke | Health and a real generation request both succeed through the configured loopback path. |
| Exact-token canary | A bounded prompt returns `HF_UNIFIED_CANARY_OK` within the timeout. |
| Error propagation | Simulated upstream HTTP 500 is shown as a structured failure; no success-shaped fallback is rendered. |
| Timeout | A delayed upstream yields a timeout error and leaves the UI responsive. |
| Profile switch | All profiles use the same configured model; only role prompt and declared scope change. |
| Memory isolation | A sentinel in sandbox A never appears in sandbox B's inference messages. |
| Reset | Reset A removes A's stored turns and leaves B unchanged. |
| Voice off/on | Off produces no speech request; on speaks the final response once; TTS failure preserves text. |
| Engineering relevance | The requested HeavenzFire task is answered with one concrete step, one failure mode, and a measurable local acceptance test. |
| Loopback guard | Non-loopback inference URLs are rejected by configuration validation. |
| Resource admission | No extra model load occurs when the existing RAM guard would reject it. |
| Auditability | Each request has a traceable terminal state and accurate timing/error data. |

## Rollout sequence

1. Capture the current UI API calls and the four components' actual process, port, model, and ownership mapping. Do not infer that four services equal four models.
2. Add the unified runtime adapter behind a feature flag or separate route.
3. Run unit tests and local end-to-end tests without changing the existing default path.
4. Compare results and resource use; verify memory, voice, and error behavior.
5. Switch the UI to the unified route only after acceptance checks pass.
6. Keep a rollback path and document any unsupported capability.

## Current limitations

The source UI and runtime contract have been inspected through repository/browser evidence, but this change has not yet been run on the user's Windows machine. A branch containing a runtime adapter and unit tests is a proposal, not a deployed integration. Do not report the four components as combined until local end-to-end evidence exists.
