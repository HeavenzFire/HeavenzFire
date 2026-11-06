# HeavenzFire Local 16-Role Orchestrator

A loopback-only, local-model analysis coordinator for sixteen named specialist roles. It supports Ollama, llama.cpp's OpenAI-compatible local endpoint, and the authenticated HeavenzFire API gateway; it does not depend on browser extensions.

## What it is (and is not)

- Sixteen distinct role prompts dispatched to the configured local model; this is **not** evidence of sixteen independent model processes or separate GPT instances.
- At most four role calls run concurrently.
- No shell, filesystem, browser, network-navigation, or arbitrary tool execution is exposed to workers.
- Goals are proposals until a separate explicit approval request is received.
- Task snapshots are appended to a local JSONL ledger (`UnifiedField/LocalOrchestrator/data/tasks.jsonl` by default); set `HF_TASK_LEDGER_PATH` to choose another path.
- Ledger writes use an exclusive lock file, append-and-fsync, and torn-final-record recovery. A task found in `running` state at startup is marked failed with `process_interrupted_before_completion`; it is never silently rerun.
- Running a task sends prompts only to the configured loopback runtime endpoint; Ollama defaults to `http://127.0.0.1:11434`, while llama.cpp defaults to `http://127.0.0.1:18080`.
- The HTTP server refuses non-loopback bind addresses. Do not expose it directly to a LAN or Tailscale interface.

## Requirements

- Node.js 18 or later
- Either Ollama on loopback (default model: `heavenzfire-runtime:latest`) or llama.cpp `llama-server` on loopback with a GGUF model installed.

## PowerShell 5.1 launch

From the repository root:

```powershell
$env:HF_ORCHESTRATOR_HOST = '127.0.0.1'
$env:HF_ORCHESTRATOR_PORT = '18797'
$env:HF_LOCAL_MODEL = 'heavenzfire-runtime:latest'
$env:HF_OLLAMA_URL = 'http://127.0.0.1:11434'
node .\UnifiedField\LocalOrchestrator\orchestrator.cjs
```

In a second PowerShell window, verify status:

```powershell
Invoke-RestMethod http://127.0.0.1:18797/health
Invoke-RestMethod http://127.0.0.1:18797/api/agents
```

## Android Termux: one-command local runtime

From a complete repository checkout, install Node.js, curl, and the Termux `llama-server` package, and ensure the Qwen GGUF exists at the default model path. Then run:

```sh
bash UnifiedField/LocalOrchestrator/start-termux.sh
```

The launcher checks for an existing healthy llama.cpp endpoint before starting one, runs a real local chat-completions smoke test, starts the orchestrator on loopback, and verifies its provider/model health. It never kills an unrelated process or opens a network listener. Configure alternate paths with `HF_MODEL_PATH`, `HF_LLAMA_CPP_BIN`, and `HF_LLAMA_CPP_MODEL`; configure ports with `HF_LLAMA_CPP_PORT` and `HF_ORCHESTRATOR_PORT`.

The launcher backgrounds both services and writes logs/PIDs under `~/.cache/heavenzfire/unified-field`. This is not an Android boot-persistence guarantee: Android may stop Termux processes, and Termux:Boot or a foreground service requires a separate device-side setup and validation.

## Hosted model adapter through the existing HeavenzFire API

The orchestrator can keep its local scheduler, JSONL ledger, approvals, and UF-TCP gate while dispatching role calls through the existing authenticated HeavenzFire API. This reuses the provider adapters in `services/heavenzfire-api/server.cjs`; it does not create a second provider registry or expose provider credentials to the orchestrator.

Start the API on loopback with `HF_API_KEYS` configured and the desired provider credential configured in that API process. Then set these variables in the orchestrator's PowerShell process:

```powershell
$env:HF_ORCHESTRATOR_PROVIDER = 'heavenzfire-api'
$env:HF_GATEWAY_URL = 'http://127.0.0.1:18796'
$env:HF_GATEWAY_API_KEY = '<same local bearer token configured in HF_API_KEYS>'
$env:HF_GATEWAY_PROVIDER = 'openai'
$env:HF_GATEWAY_MODEL = 'gpt-4.1-mini'
node .\\UnifiedField\\LocalOrchestrator\\orchestrator.cjs
```

Use `HF_GATEWAY_PROVIDER` values supported by the API: `openai`, `gemini`, `ollama`, `anthropic`, `mistral`, `qwen`, `groq`, `openrouter`, or `custom`. Set `HF_GATEWAY_MODEL` to a model actually enabled for that provider. The gateway URL is restricted to HTTP loopback and the local bearer token is required. The orchestrator stores provider name, model, and returned request IDs with task execution metadata; it never stores the bearer token or provider API key.

The API key for OpenAI (or another hosted provider) remains only in the API server's environment/secret store. ChatGPT subscription access is not converted into API access or billing. This adapter connects to the configured provider API through the local gateway; it does not attach this ChatGPT web session's private runtime.

## Task lifecycle

1. Submit a proposal: `POST /api/tasks` with JSON `{"goal":"Review a local change" }`.
2. Approval is a separate server-side trust boundary. The production entrypoint does not configure a trusted `approvalVerifier`, so approval returns HTTP 503 and task execution remains disabled by default.
3. After an independently reviewed OS-authenticated or signed approval verifier is configured by the operator, the approved task can be run with `POST /api/tasks/{id}/run`.
4. Inspect task state and results: `GET /api/tasks`.

PowerShell example:

```powershell
$proposal = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:18797/api/tasks' -ContentType 'application/json' -Body (@{goal='Review the Unified Field launch path and report risks.'} | ConvertTo-Json)
$proposal.task
# Approval is a separate, explicit action:
$taskId = $proposal.task.id
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18797/api/tasks/$taskId/approve" -ContentType 'application/json' -Body '{"approve":true}'
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18797/api/tasks/$taskId/run" -ContentType 'application/json' -Body '{}'
```

## Ternary verification boundary

A successful sixteen-role execution is an **analysis completion**, not an accepted result. The orchestrator records UF-TCP/0.2 as `ABSTAIN` until a separate verification request supplies evidence bound to the exact candidate commit.

When creating a code-review task, include its immutable candidate SHA:

```json
{ "goal": "Review candidate implementation", "candidateCommit": "40-character-git-commit-sha" }
```

After the task reaches `completed`, submit `POST /api/tasks/{id}/verify` with:
- `candidate_commit`, `reviewed_commit`, and `tested_commit`, all exactly equal to the task's candidate SHA;
- `proposer_id`, mandatory invariants, and the five required gates;
- a 64-character `evidence_sha256` digest;
- two verifier records with distinct IDs, identities, execution IDs, and isolation IDs, each bound to the same digest and decision `1`;
- counterexamples explicitly marked `refuted`, or an empty array.

The evaluator returns one deterministic ternary result:
- `+1 ACCEPT`: task becomes `verified`;
- `0 ABSTAIN`: task remains `completed` and cannot be treated as verified;
- `-1 REJECT`: task becomes `rejected`.

Missing candidate SHA, revision drift, incomplete evidence, unresolved counterexamples, or verifier disagreement abstains. A reproduced counterexample rejects. The policy checks structural provenance fields; those fields are not cryptographic proof that separate processes actually ran. External attestation remains necessary for high-assurance independence claims.

The endpoint does not authorize merges or deployments. Those remain separate human-approved operations. The regression suite exercises ACCEPT, ABSTAIN, and REJECT through the HTTP task lifecycle, not only as isolated policy-function calls. Existing tasks without a candidate SHA can still be executed for analysis, but cannot pass source-revision verification.

## Durable ledger behavior

- The ledger is an append-only JSONL event stream containing versioned task snapshots.
- A process obtains an exclusive sibling `.lock` file before reading or appending. Lock acquisition is bounded; stale locks are reclaimed only when the recorded owner process is no longer alive and the lock is older than the configured stale threshold.
- Each appended record is flushed with `fsync`. On startup, an incomplete final line is truncated; malformed complete records fail closed rather than being silently discarded.
- This is local-filesystem persistence, not a distributed database. Keep the ledger on a local disk, protect it with normal OS account permissions, and back it up with the application stopped.

## Tests

From the repository root:

```powershell
node --test .\UnifiedField\LocalOrchestrator\orchestrator.test.cjs
node --check .\UnifiedField\LocalOrchestrator\orchestrator.cjs
```

Tests inject a deterministic stub and do not require Ollama. A passing stub test verifies coordinator logic only; it does not prove live model quality or the target Windows machine's runtime status.

## Status semantics

`/health` means the coordinator process answers. `/api/agents` lists configured roles and explicitly labels them `AVAILABLE_ROLE_NOT_PROCESS_HEALTH`. Only a completed task with sixteen successful results establishes that all role calls returned for that task. Runtime, browser extension installation, and real Windows end-to-end integration still require local smoke tests.
