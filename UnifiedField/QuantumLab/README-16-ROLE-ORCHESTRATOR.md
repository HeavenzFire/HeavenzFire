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

## Per-role model routing and live progress

The runner can send different DAG roles to different model IDs through one OpenAI-compatible loopback endpoint. Unmapped roles use the fallback `HF_UNIFIED_FIELD_MODEL` (default `heavenzfire-qwen-0.5b`). Set `HF_UNIFIED_FIELD_ROLE_MODELS` to a JSON object keyed by the exact role IDs:

```powershell
$env:HF_UNIFIED_FIELD_INFERENCE_URL = 'http://127.0.0.1:11434'
$env:HF_UNIFIED_FIELD_ROLE_MODELS = @'
{
  "architect": "qwen2.5:0.5b",
  "requirements": "qwen2.5:0.5b",
  "evidence-auditor": "qwen2.5:0.5b",
  "synthesis": "qwen2.5:0.5b",
  "planner": "heavenzfire-runtime:latest",
  "designer": "heavenzfire-runtime:latest",
  "integrator": "heavenzfire-runtime:latest",
  "documentation": "heavenzfire-runtime:latest",
  "researcher": "heavenzfire:latest",
  "builder": "heavenzfire:latest",
  "release-manager": "heavenzfire:latest",
  "performance-analyst": "heavenzfire:latest",
  "test-engineer": "llama3.2:1b",
  "security-reviewer": "llama3.2:1b",
  "adversarial-verifier": "llama3.2:1b",
  "reliability-engineer": "llama3.2:1b"
}
'@
node (Join-Path $root 'sixteen-role-orchestrator.cjs') 'Audit the local Unified Field runtime; report evidence, defects, and next tests.' --max-parallel=2 --max-tokens=256 --timeout-ms=45000
```

Use the Ollama endpoint only when its OpenAI-compatible API is actually listening at `127.0.0.1:11434`. The role map selects model IDs; it does not install models or prove they are loaded. Start with bounded concurrency (1–2) until available RAM and model-load behavior are measured. `--role-models-json=...` is also available, and the timeout is bounded to 1,000–120,000 ms.

The CLI now emits `[START]`, `[PASS]`, `[REVIEW]`, `[FAIL]`, and `[BLOCKED]` lines as roles change state, rather than remaining silent until the final report. The JSON report records the model selected for each role and the distinct models actually attempted. Sixteen roles remain logical DAG workers, not sixteen independent processes; outputs still require semantic review.

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

## Role-specific acceptance and bounded repair

Each role now has a required deliverable and a role-specific signal check. A non-empty, non-refusal response receives at most one targeted repair attempt when it is truncated (`finish_reason=length`) or fails its role-specific signal check. The retry is deterministic (`temperature=0`); truncation raises the token budget within the existing 512-token cap, while a specificity repair keeps the original budget. Empty and refusal responses are not retried. A failed retry remains `review_required` and blocks dependent roles.

The Builder deliverable is exactly three non-empty rows. Every row must contain all four fields: `FILE:`, `PROPOSED CHANGE:`, `DEPENDENCIES:`, and `VERIFICATION:`.

`qualityGate.passed` now requires all sixteen roles to complete and pass their role-specific signal check. This remains a structural/content-shape gate, not factual or semantic verification: `semanticReviewRequired` stays true, report `status` remains `review_required`, and `ok` remains false until independent review occurs.

For a low-memory sequential baseline, use `--max-parallel=1` and the exact locally installed model ID. The runner does not install or download models.

The non-Builder role check requires at least two literal role-specific acceptance anchors and at least 80 characters of output. The prompt supplies those anchors to the model and the single repair prompt repeats them. This is a content-shape check only; it does not establish that the statements are true.

Builder rows may target only:
- `UnifiedField/QuantumLab/sixteen-role-orchestrator.cjs`
- `UnifiedField/QuantumLab/sixteen-role-orchestrator.test.cjs`

The GitHub Actions workflow `.github/workflows/quantumlab-qwen-live.yml` runs a sequential live inference smoke test with the exact `qwen2.5:0.5b` model on a GitHub-hosted runner and retains the JSON report as a workflow artifact. It validates the runner/model API path, not the user's local Windows or Android runtime.
