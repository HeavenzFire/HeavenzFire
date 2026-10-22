# HeavenzFire Unified Intelligence — Build Track

**Status:** Active build branch; local deployment remains unverified until the acceptance script is run on the Windows host.

## Goal

One HeavenzFire assistant identity backed by one resident local model, with switchable reasoning lenses, isolated conversation memory, truthful error reporting, and optional voice at the UI layer.

Historical profiles are prompts applied to one model. They are not independent neural networks or literal recreations of historical people.

## Current topology

- Local inference gateway: `http://127.0.0.1:11800/v1`
- Documented model: `heavenzfire-qwen-0.5b`
- Existing Micro Mind Sandbox UI: `http://127.0.0.1:11811/`
- New unified runtime API: planned as a separate loopback service; it must not take over an existing port until verified.

## What is in this branch

- `historical-profile-runtime.cjs`: single-model adapter with deterministic request parameters, role prompts, memory isolation, reset, bounded inputs, loopback URL validation, and structured upstream errors.
- `historical-profile-runtime.test.cjs`: unit tests for profile registration, model routing, memory isolation/reset, and failure handling.
- `.github/workflows/unified-intelligence-tests.yml`: Node 22 CI test gate.
- `UNIFIED_INTELLIGENCE_CONSOLIDATION.md`: acceptance criteria, voice contract, resource policy, and rollout plan.

## Local verification (PowerShell 5.1)

Run from the repository root:

```powershell
node --version
node --test .\UnifiedField\QuantumLab\historical-profile-runtime.test.cjs
if ($LASTEXITCODE -ne 0) { throw "Unified runtime tests failed." }
```

The adapter requires a modern Node.js runtime with built-in `fetch` and `AbortSignal.timeout` (Node 18+; CI uses Node 22).

## Required end-to-end proof before switching the UI

1. Confirm gateway health and a real completion request at `127.0.0.1:11800`.
2. Verify the configured model is available and fits the current RAM budget.
3. Run a canary that returns `HF_UNIFIED_CANARY_OK`.
4. Verify profile switching keeps the same model and separates memory scopes.
5. Inject an upstream HTTP 500 and verify the UI shows a failure—not a fabricated answer.
6. Verify voice off/on behavior and browser playback separately from text generation.
7. Only then route the existing UI through the unified runtime.

No local service has been launched by this commit. CI passing would prove the tested code paths on GitHub's runner, not that the Windows services are healthy.
