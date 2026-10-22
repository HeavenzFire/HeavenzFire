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

## Local verification and launch (PowerShell 5.1)

Run from the repository root:

```powershell
node --version
node --test .\UnifiedField\QuantumLab\historical-profile-runtime.test.cjs .\UnifiedField\QuantumLab\HeavenzFire-Unified-Intelligence-Server.test.cjs
if ($LASTEXITCODE -ne 0) { throw "Unified runtime tests failed." }
```

After the repository has synced to the Windows machine, start the API with the launcher:

```powershell
.\UnifiedField\QuantumLab\Start-HeavenzFireUnifiedIntelligence.ps1
```

To require a real model-generation canary before startup:

```powershell
.\UnifiedField\QuantumLab\Start-HeavenzFireUnifiedIntelligence.ps1 -RequireInference
```

The launcher runs tests first and refuses to overwrite an existing service. It does not stop or replace the existing UI. Once started, verify from a second PowerShell window:

```powershell
Invoke-RestMethod http://127.0.0.1:11812/api/health
Invoke-RestMethod http://127.0.0.1:11812/api/profiles
```

The API binds to loopback only, keeps memory session-only and bounded to 64 in-process sandboxes, and returns structured errors when inference fails. It does not connect the existing UI yet; UI wiring is a separate step after the real gateway canary and voice checks pass.

## Required end-to-end proof before switching the UI

1. Confirm gateway health and a real completion request at `127.0.0.1:11800`.
2. Verify the configured model is available and fits the current RAM budget.
3. Run a canary that returns `HF_UNIFIED_CANARY_OK`.
4. Verify profile switching keeps the same model and separates memory scopes.
5. Inject an upstream HTTP 500 and verify the UI shows a failure—not a fabricated answer.
6. Verify voice off/on behavior and browser playback separately from text generation.
7. Only then route the existing UI through the unified runtime.

No local service has been launched by this commit. A passing GitHub workflow proves tested code paths on the runner, not that the Windows services are healthy.
