# HeavenzFire Local 16-Role Orchestrator

A loopback-only, local-model analysis coordinator for sixteen named specialist roles. It uses the existing Ollama runtime and does not depend on browser extensions.

## What it is (and is not)

- Sixteen distinct role prompts dispatched to the configured local model; this is **not** evidence of sixteen independent model processes or separate GPT instances.
- At most four role calls run concurrently.
- No shell, filesystem, browser, network-navigation, or arbitrary tool execution is exposed to workers.
- Goals are proposals until a separate explicit approval request is received.
- Running a task sends prompts only to the configured Ollama endpoint; default is `http://127.0.0.1:11434`.
- The HTTP server refuses non-loopback bind addresses. Do not expose it directly to a LAN or Tailscale interface.

## Requirements

- Node.js 18 or later
- Local Ollama running on loopback with a model installed (default: `heavenzfire-runtime:latest`)

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

## Task lifecycle

1. Submit a proposal: `POST /api/tasks` with JSON `{"goal":"Review a local change" }`.
2. Explicitly approve it: `POST /api/tasks/{id}/approve` with JSON `{"approve":true}`.
3. Run it: `POST /api/tasks/{id}/run`.
4. Inspect results: `GET /api/tasks`.

PowerShell example:

```powershell
$proposal = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:18797/api/tasks' -ContentType 'application/json' -Body (@{goal='Review the Unified Field launch path and report risks.'} | ConvertTo-Json)
$proposal.task
# Approval is a separate, explicit action:
$taskId = $proposal.task.id
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18797/api/tasks/$taskId/approve" -ContentType 'application/json' -Body '{"approve":true}'
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:18797/api/tasks/$taskId/run" -ContentType 'application/json' -Body '{}'
```

## Tests

From the repository root:

```powershell
node --test .\UnifiedField\LocalOrchestrator\orchestrator.test.cjs
node --check .\UnifiedField\LocalOrchestrator\orchestrator.cjs
```

Tests inject a deterministic stub and do not require Ollama. A passing stub test verifies coordinator logic only; it does not prove live model quality or the target Windows machine's runtime status.

## Status semantics

`/health` means the coordinator process answers. `/api/agents` lists configured roles and explicitly labels them `AVAILABLE_ROLE_NOT_PROCESS_HEALTH`. Only a completed task with sixteen successful results establishes that all role calls returned for that task. Runtime, browser extension installation, and real Windows end-to-end integration still require local smoke tests.
