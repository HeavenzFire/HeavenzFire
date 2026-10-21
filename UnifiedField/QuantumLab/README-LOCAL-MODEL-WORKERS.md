# Local model worker batch

The Unified Field dashboard exposes a fixed, loopback-only action that asks the local Ollama runtime to draft the same bounded PowerShell utility task with each configured model.

## Components

- `Invoke-LocalModelWorkerBatch.ps1` calls only the local Ollama HTTP API at `127.0.0.1:11434` by default.
- The batch writes a timestamped JSON artifact under `UnifiedField/QuantumLab/LocalAI` (or a supplied output directory).
- `UnifiedField-Dashboard-Server.cjs` exposes `POST /api/worker/run` and includes the latest result artifact in `GET /api/overview`.
- The dashboard displays model availability, generation status, elapsed time, and a bounded response preview.

The dashboard also exposes a **Retry failed models** control after a batch. It submits only the failed or statically rejected model tags from the latest result artifact; the server checks every tag against a fixed allowlist and rejects duplicates or unknown models. It does not accept shell commands or arbitrary prompts. A retry is still a new generation attempt and must pass the same static checks before being counted as validated.

## Run locally

From PowerShell 5.1:

```powershell
$root = Join-Path $env:USERPROFILE 'HeavenzFire\UnifiedField\QuantumLab'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'Invoke-LocalModelWorkerBatch.ps1')
```

Open `http://127.0.0.1:8800/` and use **Run build-task batch**. Only one batch may run at a time. The dashboard server must be restarted after server-code updates.

## Safety and current limits

- The dashboard server binds to `127.0.0.1`; the action is a fixed batch, not arbitrary command execution.
- Cross-origin requests to the action are rejected.
- Model responses are untrusted artifacts. The batch does not execute generated code or treat model-provided tests as passing tests.
- Generation success means only that a non-empty response was returned. A separate non-executing static check parses the response JSON, parses the proposed PowerShell with the PowerShell AST parser without executing it, inspects expected function/loop/accumulator structure, and independently recalculates numeric test expectations. The validator may apply two narrow, deterministic normalizations before checking: parse a JSON-encoded numeric input array and trim a stray terminal period from the code string. It preserves the original response and discloses normalization warnings. One bounded repair request is attempted for a response that still fails checks; original and repair outcomes are retained. Transport/server failures are recorded and the batch continues to the next model. Passing static checks is not proof of PowerShell runtime correctness or four autonomous agents; generated code is never executed.
- Results are local JSON artifacts. No public repository write, external model call, or network peer synchronization is performed by this worker.
- When `HEAVENZFIRE_BRIDGE_TOKEN` is configured and the local journal worker is listening (default `http://127.0.0.1:8798`), the dashboard submits metadata-only review tasks to `POST /api/tasks` using bearer authentication. Override the endpoint with `HEAVENZFIRE_BRIDGE_URL` if needed.
- Each model/artifact pair receives a deterministic task ID and idempotency key, so repeated publication is deduplicated by the journal. Only the artifact written during the current batch is eligible for publication; old output is not silently relabeled as current.
- If the token or journal service is unavailable, the local output artifact is preserved and the dashboard reports a blocked/partial publication state. It does not delete the output or retry indefinitely in the background; operators can safely re-run publication because the journal is idempotent.
- Journal entries ask for independent review and reference the artifact filename; they do not embed or execute generated code.
- Generated drafts are queued for independent artifact review; model/transport failures are queued as failure-triage tasks instead of being mislabeled as drafts. Actual sandboxed code verification and automatic retry/reassignment remain incomplete.

## Acceptance checks

1. Dashboard health endpoint reports the local fixed-worker mode.
2. `GET /api/overview` includes `modelWorker.run` and `modelWorker.latest`.
3. `POST /api/worker/run` accepts a fixed batch, rejects a concurrent run, and rejects untrusted Origin values.
4. The batch records a result for each configured model, including per-model errors.
5. Generated code is never executed by the batch.
