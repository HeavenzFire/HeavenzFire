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

## Routes

`GET /health`; `GET /api/github/repository`; `GET /api/github/issues`; `GET /api/github/pulls`; `GET /api/github/commits`; `GET /api/github/files`; `POST /api/github/branches`; `PUT /api/github/files`; `POST /api/github/pulls`; `POST /api/github/issues`; `POST /api/tasks`; `POST /api/tasks/:id/run`; `GET /api/tasks/:id`; `GET /api/audit/recent`.
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
