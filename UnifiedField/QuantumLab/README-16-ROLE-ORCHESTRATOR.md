# Local 16-role orchestrator

This entry point runs the sixteen-role dependency DAG against a local OpenAI-compatible inference server. It is separate from the metadata-only task inbox and does not execute model-generated code.

## Requirements

- Node.js 18 or newer (built-in `fetch`; no npm dependencies).
- A local inference server exposing `POST /v1/chat/completions`.
- Default endpoint: `http://127.0.0.1:11800`.
- Default model: `heavenzfire-qwen-0.5b`.

## Run from PowerShell 5.1

```powershell
$root = Join-Path $env:USERPROFILE 'HeavenzFire\UnifiedField\QuantumLab'
node (Join-Path $root 'sixteen-role-orchestrator.cjs') 'Audit the local Unified Field runtime; report evidence, defects, and next tests.' --max-parallel=2 --max-tokens=256
```

Optional environment overrides are `HF_UNIFIED_FIELD_INFERENCE_URL`, `HF_UNIFIED_FIELD_MODEL`, `HF_UNIFIED_FIELD_MAX_PARALLEL`, and `HF_UNIFIED_FIELD_MAX_TOKENS`. Command-line options are `--endpoint=`, `--model=`, `--max-parallel=`, `--max-tokens=`, and `--timeout-ms=`.

The endpoint guard accepts HTTP(S) loopback destinations only. The runner writes a timestamped report under `reports/runs` and updates `reports/latest-sixteen-role-run.json` beside the script. Keep generated reports local; they may contain task details.

## Gate semantics

- The DAG has sixteen distinct role IDs and only schedules a role after all prerequisites have usable, untruncated output.
- Empty output, refusal output, `finish_reason=length`, transport errors, and worker exceptions are not successes. Dependent roles are blocked.
- `qualityGate.passed` means only that all sixteen roles returned non-empty, non-refusal, untruncated text. It does **not** establish factual correctness.
- Overall report status remains `review_required` and `ok=false` until an independent semantic review is implemented and performed. Do not treat model prose as evidence that files were changed or tests passed.
- This runner makes inference HTTP requests in the Node process rather than spawning one Node child process per role, avoiding the separate child-process initialization failure seen in one Windows run. It cannot guarantee the local model server itself remains healthy.

## Tests

```powershell
node --test (Join-Path $root 'sixteen-role-orchestrator.test.cjs')
```
