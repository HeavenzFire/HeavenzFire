# Local Mesh and Multi-Model Council

This directory contains a portable source copy of the local Windows implementation developed and tested in the HeavenzFire workspace. The operator's current live report and runtime configuration remain local; this repository does not contain the DPAPI token.

## Prerequisites

- Windows PowerShell 5.1 or newer
- Python 3.12+ standard library
- Node.js runtime for the rest of Unified Field
- Ollama running on `127.0.0.1:11434`
- The HeavenzFire coordinator on `127.0.0.1:8080`
- A current-user DPAPI-protected mesh token at `%LOCALAPPDATA%\HeavenzFire\UnifiedField\mesh-token.dpapi`
- The configured worker models installed locally: `qwen2.5:0.5b`, `llama3.2:1b`, `heavenzfire-runtime:latest`, and optionally `heavenzfire:latest`

## Run regression tests

From the directory containing `worker.py` and `test_model_pipeline.py`:

```powershell
python .\test_model_pipeline.py
```

The tests cover deterministic hashing, bounded rounds, model allowlisting, prompt limits, and a live local inference call when Ollama is available.

## Run the council

After the authenticated coordinator and workers are running:

```powershell
.\Invoke-HeavenzFireCouncil.ps1 -Prompt "Design a testable local-first integration for a specific engineering objective."
```

The default run asks three distinct local models for candidate approaches and then asks a reviewer model to compare them. The JSON report is written under:

`%LOCALAPPDATA%\HeavenzFire\UnifiedField\council-reports\`

You can override the model list with the `-Models` parameter, but only the source-defined allowlist is accepted. Model responses are proposals, not proof. Review the report and run independent tests before implementing a recommendation.

## Task contract

- `hash_task`: `payload.input` string, optional `payload.rounds` integer from 1 to 100000.
- `model_task`: `payload.prompt` string up to 3000 characters and a `payload.model` from the explicit local allowlist.
- Output token count is capped at 180 for worker model tasks.
- The worker does not expose shell execution or arbitrary tools through this contract.

## Security and limits

The coordinator's task routes require a bearer token. The worker's token is supplied through its process environment by the local launcher; the token is protected at rest with Windows DPAPI. Keep services loopback-bound unless a separate authenticated device-bridge design is reviewed and tested. Do not commit tokens, raw reports containing private user content, or local secrets.

The queue is a classical asynchronous worker pool. “Quantum threading” is an architectural metaphor for task routing, not a claim of quantum computation or quantum speedup. No autonomous code modification is performed by the council.
