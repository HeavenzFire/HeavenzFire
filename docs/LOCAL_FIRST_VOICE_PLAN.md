# HeavenzFire Local-First Voice — Architecture and Delivery Plan

## Objective

Provide a usable voice interface for the HeavenzFire Unified Field without requiring a recurring subscription to one hosted voice provider. Prefer local processing, open interfaces, replaceable components, and user-controlled cloud fallbacks.

This document is a design contract, not a claim that voice functionality has already been implemented or tested.

## User-visible MVP

1. Push-to-talk microphone capture in a local web UI.
2. Speech-to-text (STT) produces a transcript that the user can inspect and correct.
3. Transcript enters the existing Unified Field task/approval boundary; speech must not bypass authorization.
4. Text-to-speech (TTS) reads back the response.
5. Visible status and logs indicate microphone, model, inference, and playback errors.
6. Text input remains available when microphone, audio device, or model fails.

## Proposed modular pipeline

`Audio input -> STT adapter -> transcript confirmation/policy -> task router -> authorized tools/models -> response text -> TTS adapter -> audio output`

Adapters should expose stable interfaces so STT/TTS engines can be swapped without rewriting orchestration. Candidate engines (subject to platform, license, hardware, and latency testing) include whisper.cpp or faster-whisper for STT, and Piper or Kokoro for TTS. Do not bundle or redistribute a model until its license and model terms have been checked.

## Safety and privacy requirements

- Default to loopback-only binding; do not expose microphone or control endpoints to the LAN/WAN without explicit configuration and authentication.
- Show a clear recording indicator; do not record or persist raw audio by default.
- Make transcript retention configurable and document where any transcript is stored.
- Treat recognized speech as untrusted input. Prompt injection in audio/transcripts must not override system policy.
- Require explicit approval for destructive, privileged, financial, external-send, or security-sensitive actions, using the same server-side authorization verifier as typed commands.
- A spoken "yes" must not be accepted as approval unless bound to a specific pending action, request ID, exact canonical inputs, expiry, and one-time server-side consumption.
- Fail closed when authorization, transcript confidence, or action identity is ambiguous. Ask the user to confirm the transcript or intended action.
- Never speak secrets or credentials by default; redact sensitive values from logs.
- Provide a stop/cancel control that halts playback and cancels only actions that are still safely cancellable.

## Performance and resilience

- Measure cold start, real-time factor, end-to-end latency, peak RAM/VRAM, CPU load, and disk footprint on the actual ZDH machine before selecting defaults.
- Keep models optional downloads; do not automatically download large model weights or fill a low-space C: drive.
- Use a small configurable model profile first; provide clear model-missing and insufficient-resource errors.
- Avoid continuous listening in the MVP. Start with push-to-talk to limit accidental capture, resource use, and privacy risk.
- Support interruption during TTS playback; true barge-in requires echo cancellation/VAD and should be a later milestone.

## Implementation milestones

### M0 — Repository and environment audit
Locate current UI, local API, agent router, logging, and approval boundary. Record supported Node/Python versions and existing tests. Do not duplicate existing components.

### M1 — Audio adapter contracts
Define typed STT/TTS interfaces, configuration, error codes, and mock adapters. Add unit tests without downloading models.

### M2 — Push-to-talk vertical slice
Implement local microphone capture, transcript preview/edit, and playback behind a feature flag. Keep all endpoints loopback-only.

### M3 — Local engines
Add optional STT/TTS adapters with documented licenses, installation instructions, model-size choices, and offline smoke tests. Do not claim offline operation until verified with network disabled.

### M4 — Policy integration
Route transcript text through the same task ledger, policy checks, and approval verifier used by typed input. Add adversarial tests for misrecognition, replay, expired approvals, concurrent approvals, and destructive commands.

### M5 — Hardware and end-to-end validation
On ZDH, record exact model versions, hardware utilization, latency, disk usage, test commands, and results. Verify offline operation and confirm no raw audio is persisted by default.

### M6 — Release gate
Require passing unit, integration, security, and UI tests; dependency/license review; and a reproducible setup guide. Keep the feature opt-in until these gates pass.

## Definition of done

- A user can press a button, speak, inspect/correct the transcript, submit it, and hear a response.
- STT and TTS can be replaced independently.
- The core voice path works offline after the chosen models are installed, proven by a network-disabled test.
- Voice actions use the existing authorization boundary and cannot elevate privileges or bypass approval.
- Tests cover microphone denial, missing models, malformed transcripts, cancellation, expiry, replay, concurrency, and service failure.
- Setup, model licensing, resource requirements, privacy behavior, and limitations are documented.
- CI evidence names the tests actually executed. A green unrelated workflow is not evidence of voice readiness.

## Initial acceptance tests

- Mock STT returns a transcript and the UI displays an editable preview.
- Mock TTS receives the response text and reports completion/failure.
- Microphone permission denial leaves text mode usable.
- Unknown speech or low-confidence transcript requires confirmation before action.
- A transcript requesting a privileged/destructive action cannot bypass server-side approval.
- Replaying or racing an approval results in at most one successful consumption.
- No model download occurs automatically during startup.
- With network disabled and models installed, local STT/TTS smoke tests pass.

## Known unknowns

The current repository's actual UI framework, local audio dependencies, and available hardware resources must be audited before implementation choices are finalized. This plan does not assert that any engine is installed or that local/offline performance has been measured.
