# HeavenzFire TeamBridge v0.1

A local-first, hybrid coordination foundation that reuses Unified Field's PropagationFabric message envelope and the existing HeavenzFire local agent/orchestrator services. This is not a second inference engine and does not execute commands.

## What exists

- `team-registry.json`: explicit provider inventory with evidence-qualified initial states.
- `team-ledger.cjs`: append-only, fsync-backed JSONL event ledger; task lifecycle; idempotency; approval records; durable message outbox; provider probe history.
- `team-ledger.test.cjs`: restart, idempotency, approval-gate, state-machine, message, and corruption tests.
- `Test-TeamProviders.ps1`: PowerShell 5.1-compatible, read-only provider inventory and loopback health probe. It never reads credential values and never calls an external provider API.

## Run the checks (PowerShell 5.1)

```powershell
Set-Location "$env:USERPROFILE\HeavenzFire\UnifiedField\TeamBridge"
node --test .\team-ledger.test.cjs
.\Test-TeamProviders.ps1
```

The probe's `cli_present_auth_unverified` means only that an executable was found. It is not an authenticated connection test. To qualify an external provider, add a narrowly scoped adapter and perform an actual request through that provider's supported CLI/API, then record the result with a test reference. Never paste API keys, access tokens, cookies, private keys, or credential files into this registry or ledger.

## Task policy

Tasks are proposals and audit records, not shell jobs. Risk classes `HIGH`, `PRIVILEGED`, `DESTRUCTIVE`, `CREDENTIAL`, `NETWORK_CHANGE`, `INSTALL`, and `EXTERNAL` start in `awaiting_approval`. They cannot be queued until an explicit approval record exists. Lower-risk tasks still require an explicit state transition before queueing. No task transition launches code by itself.

The `approveTask` API records the operator identity and reason supplied by the caller. It does not cryptographically authenticate the human; a future UI/bridge must enforce a real approval interaction before calling it. Never expose this module through an unauthenticated network endpoint.

## Durable messaging

Messages use the existing `heavenzfire.fabric.v1` envelope contract from `../PropagationFabric/fabric-envelope.cjs`. `queueMessage` writes a durable `message.queued` event. The state stays `queued` until a transport calls `acknowledgeMessage`. Queuing a message does not prove delivery, and this v0.1 module has no external AI-provider transport yet.

The event ledger is append-only and fails closed on malformed records. It is designed for one writer at a time; do not share the JSONL ledger between concurrent processes until a locking/SQLite adapter is added. Keep task payloads metadata-only and free of secrets.

## Current integration truth

- Local Ollama, HeavenzFire agent, gateway, and orchestrator returned HTTP 200 during the 2026-10-21 inspection.
- GitHub repository reading works in the current ChatGPT session; this does not create a local GitHub CLI credential.
- Google Antigravity CLI `agy.exe` exists, but authentication and actual model inference are not yet verified.
- Claude was reported as account-only; no `claude` executable was found on PATH.
- Copilot, Codex CLI, and Qwen Code CLI executables were not found on PATH during inspection.
- The Gemini Bridge GitHub App installation page requires at least one repository selection; installation is incomplete.
- No provider is represented as a continuously running, cross-platform agent merely because it appears in this registry.

## Next integration steps

1. Run the provider probe and preserve its output as evidence.
2. Complete the Gemini GitHub App installation with least-privilege repository selection.
3. Verify external CLI/API authentication without exposing credential material.
4. Add one provider adapter at a time behind the existing approval policy.
5. Add an authenticated transport and a shared task/event store before claiming a permanent cloud-connected team.