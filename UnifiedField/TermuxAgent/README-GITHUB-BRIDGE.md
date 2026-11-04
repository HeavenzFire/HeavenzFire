# HeavenzFire GitHub Bridge

Windows-local GitHub integration for the Unified Field task inbox and 16-role orchestrator.

- Listener: `127.0.0.1:18798` only.
- Authentication: existing `gh auth` session; token is read at runtime and never logged.
- Repository owners: `HeavenzFire` by default; optional `HF_GITHUB_OWNERS` comma-separated allowlist.
- Durable audit: `%LOCALAPPDATA%\HeavenzFire\UnifiedField\github-bridge-audit.jsonl`.
- Task inbox: `127.0.0.1:18796`; orchestrator: `127.0.0.1:18797`.
- GitHub writes require explicit per-request approval and idempotency key; default-branch writes and merges are disabled. Pull requests are drafts.
- Task role calls use the configured local inference backend; the 16 roles are not independent model instances.

## Start

`powershell -NoProfile -ExecutionPolicy Bypass -File .\UnifiedField\TermuxAgent\Start-GitHubBridge.ps1`

## Optional logon autostart

`powershell -NoProfile -ExecutionPolicy Bypass -File .\UnifiedField\TermuxAgent\Install-GitHubBridgeAutostart.ps1`

The second command registers a limited-privilege current-user scheduled task. It does not add firewall rules or store credentials.

## Routes

`GET /health`; `GET /api/github/repository`; `GET /api/github/issues`; `GET /api/github/pulls`; `GET /api/github/commits`; `GET /api/github/files`; `POST /api/github/branches`; `PUT /api/github/files`; `POST /api/github/pulls`; `POST /api/github/issues`; `POST /api/tasks`; `POST /api/tasks/:id/run`; `GET /api/tasks/:id`; `GET /api/audit/recent`.