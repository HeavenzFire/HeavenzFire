# HeavenzFire GitHub Bridge

Windows-local GitHub integration for the Unified Field task inbox and 16-role orchestrator.

- Listener: `127.0.0.1:18798` only.
- Authentication: existing `gh auth` session; token is read at runtime and never logged.
- Repository owners: `HeavenzFire` by default; optional `HF_GITHUB_OWNERS` comma-separated allowlist.
- Durable audit: `%LOCALAPPDATA%\HeavenzFire\UnifiedField\github-bridge-audit.jsonl`.
- Task inbox: `127.0.0.1:18796`; orchestrator: `127.0.0.1:18797`.
- GitHub writes and task execution require a server-side `approvalVerifier` plus an idempotency key for GitHub mutations. HTTP fields such as `approved: true`, `approvedBy`, and `reason` are untrusted and never authorize an action.
- No trusted human-approval broker is implemented or configured by default in this PR. Without an independently configured verifier, mutation and task-run endpoints fail closed with HTTP 503; the bridge remains read-only apart from task proposals.
- A future verifier must independently validate attributable, action-bound evidence (for example, an OS-authenticated approval broker or signed one-time approval), and return canonical approval ID, actor, reason, method, and verification time. The same trust policy must be configured in the orchestrator; model output and task payloads must never mint approval evidence.
- Default-branch writes and merges are disabled. Pull requests are drafts.
- Task role calls use the configured local inference backend; the 16 roles are not independent model instances.

## Start

`powershell -NoProfile -ExecutionPolicy Bypass -File .\UnifiedField\TermuxAgent\Start-GitHubBridge.ps1`

## Optional logon autostart

`powershell -NoProfile -ExecutionPolicy Bypass -File .\UnifiedField\TermuxAgent\Install-GitHubBridgeAutostart.ps1`

The second command registers a limited-privilege current-user scheduled task. It does not add firewall rules or store credentials.


## Audit data minimization

New bridge audit records do not duplicate full task prompts or inference results:

- `task_submitted` records contain the task ID, SHA-256 goal digest, UTF-8 byte count, and inbox acceptance flag; the raw goal and inbox response are not persisted in the bridge audit.
- `task_execution_completed` records contain the result SHA-256 digest and UTF-8 byte count, not the raw result. The full task result remains in the local orchestrator's task history, where it is needed for task retrieval.
- The bridge keeps at most 100 recent results and 1,000,000 UTF-8 bytes in a process-local cache for same-process idempotent replay. After restart or cache eviction, replay returns HTTP 409 with the task ID, orchestrator task ID, and result digest; retrieve the result from the local orchestrator task history.
- The in-memory recent audit buffer is capped at 500 events; `GET /api/audit/recent` returns the latest 100.

**Legacy and retention boundary:** existing JSONL records are not rewritten or deleted and may still contain full goals, inbox responses, or results from earlier versions. The durable JSONL file remains append-only and has no automatic rotation or retention limit. This patch does not establish Windows ACLs or a retention policy. Do not place child, patient, or identifiable family-case data in the system until those host-level controls are independently validated.

## Local task and audit API authentication

The production bridge and task inbox require a shared bearer token for task intake, task lookup, task execution/replay, and audit-history reads. The task inbox independently enforces the token on its own `GET /api/tasks` and `GET /api/tasks/:id` routes, so direct loopback access cannot bypass the bridge gate. Set `HF_GITHUB_BRIDGE_READ_TOKEN` in the bridge process environment to a randomly generated secret of at least 32 characters. Send it as `Authorization: Bearer <token>` on those routes. If the token is missing or invalid, protected routes fail closed with HTTP 503 (missing server configuration) or HTTP 401 (invalid caller token); `/health` remains available, reports only whether authorization is configured, and does not disclose the token. Set the same environment variable before launching both services. The PowerShell task inbox launcher and review script require the configured token; the bridge forwards it only to authenticated inbox reads. Do not commit the token, place it in task payloads, or print it in logs. The `gh auth` token is for GitHub API access and is not a substitute for this local API credential. Legacy raw results are never rehydrated into the replay cache; after restart, replay returns HTTP 409 with only a digest. Existing JSONL bytes are preserved and are not automatically erased.

## Routes

`GET /health`; `GET /api/github/repository`; `GET /api/github/issues`; `GET /api/github/pulls`; `GET /api/github/commits`; `GET /api/github/files`; `POST /api/github/branches`; `PUT /api/github/files`; `POST /api/github/pulls`; `POST /api/github/issues`; `POST /api/tasks`; `POST /api/tasks/:id/run`; `GET /api/tasks/:id`; `GET /api/audit/recent`.
## Local inference provider selection

The orchestrator supports three explicit providers:

- `ollama` (default): Ollama's local `/api/chat` endpoint on `127.0.0.1:11434`.
- `llama-cpp`: llama.cpp's OpenAI-compatible `/v1/chat/completions` endpoint. Set `HF_ORCHESTRATOR_PROVIDER=llama-cpp`, `HF_LLAMA_CPP_URL=http://127.0.0.1:18080`, and `HF_LLAMA_CPP_MODEL=qwen2.5-0.5b-instruct-q4_k_m.gguf` for the previously verified Termux llama-server configuration.
- `heavenzfire-api`: the authenticated loopback HeavenzFire gateway.

The llama.cpp adapter sends no bearer token and accepts only plain HTTP loopback URLs; do not expose this unauthenticated endpoint on a LAN or public interface. The server must already be running. Health reports the selected provider/model but does not claim that inference is reachable; submit a bounded test task only after the runtime's own health endpoint responds.

## Approval verifier contract

Both `github-bridge-server.cjs` and `LocalOrchestrator/orchestrator.cjs` accept an optional server-side `approvalVerifier` function at construction. The function receives `{ action, subject, evidence }` and must independently verify the evidence against the exact action and subject. It must return:

```js
{
  approved: true,
  approvalId: 'immutable approval identifier',
  approvedBy: 'verified human identity',
  reason: 'human-readable reason',
  method: 'verification mechanism',
  verifiedAt: '2026-11-05T08:00:00.000Z'
}
```

The shared `FieldCore/trusted-approval.cjs` helper validates the verifier result and records hashes of the supplied evidence and bound subject. Raw evidence is not copied into the audit record. The default production entry points do not install a verifier, so approval-dependent operations remain disabled until a trusted, independently reviewed broker is implemented and configured. Tests inject a deterministic verifier only as a test double; it is not a production approval mechanism.
