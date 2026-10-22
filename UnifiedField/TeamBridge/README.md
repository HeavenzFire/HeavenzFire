# HeavenzFire TeamBridge v0.1

A local-first, hybrid coordination foundation that reuses Unified Field's PropagationFabric message envelope and the existing HeavenzFire local agent/orchestrator services. This is not a second inference engine and does not execute commands.

## What exists

- `team-registry.json`: operational team/runtime availability roster. It is not the provider capability/routing catalog; the separate AI Federation proposal in PR #75 defines that contract and needs reconciliation before both proposals are merged.
- `team-ledger.cjs`: append-only, fsync-backed JSONL event ledger; task lifecycle; idempotency; approval records; durable message outbox; provider probe history; persisted results.
- `team-dispatcher.cjs`: bounded local Ollama adapter for queued messages, loopback-only and model-allowlisted.
- `team-ledger.test.cjs` and `team-dispatcher.test.cjs`: restart, idempotency, approval-gate, state-machine, message, adapter, and corruption tests.
- `Test-TeamProviders.ps1`: PowerShell 5.1-compatible, read-only provider inventory and loopback health probe. It never reads credential values and never calls an external provider API.

## Run the checks (PowerShell 5.1)

```powershell
Set-Location "$env:USERPROFILE\HeavenzFire\UnifiedField\TeamBridge"
node --test .\team-ledger.test.cjs .\team-dispatcher.test.cjs
.\Test-TeamProviders.ps1
node .\team-dispatcher.cjs --smoke-test
```

The probe's `cli_present_auth_unverified` means only that an executable was found. It is not an authenticated connection test. To qualify an external provider, add a narrowly scoped adapter and perform an actual request through that provider's supported CLI/API, then record the result with a test reference. Never paste API keys, access tokens, cookies, private keys, or credential files into this registry or ledger.

## Task policy

Tasks are proposals and audit records, not shell jobs. Risk classes `HIGH`, `PRIVILEGED`, `DESTRUCTIVE`, `CREDENTIAL`, `NETWORK_CHANGE`, `INSTALL`, and `EXTERNAL` start in `awaiting_approval`. They cannot be queued until an explicit approval record exists. Lower-risk tasks still require an explicit state transition before queueing. No task transition launches code by itself.

The `approveTask` API records the operator identity and reason supplied by the caller. It does not cryptographically authenticate the human; a future UI/bridge must enforce a real approval interaction before calling it. Never expose this module through an unauthenticated network endpoint.

## Durable messaging

Messages use the existing `heavenzfire.fabric.v1` envelope contract from `PropagationFabric/fabric-envelope.cjs` (the local workspace and repository checkout have different parent-folder layouts, so the module resolves either existing location). `queueMessage` writes a durable `message.queued` event. The `team-dispatcher.cjs` adapter can dispatch queued messages targeted at `local-ollama` to `http://127.0.0.1:11434/api/chat`, with a strict model allowlist, a prompt-size limit, and a timeout. It stores the response and only then acknowledges delivery. It rejects external provider targets; no external AI-provider transport is implemented yet. Run `node .\team-dispatcher.cjs --smoke-test` for an explicit end-to-end local inference test.

The event ledger is append-only and fails closed on malformed records. It is designed for one writer at a time; do not share the JSONL ledger between concurrent processes until a locking/SQLite adapter is added. Keep task payloads metadata-only and free of secrets.

## Current integration truth

- Local Ollama, HeavenzFire agent, gateway, and orchestrator returned HTTP 200 during the 2026-10-21 local-time inspection.
- The TeamBridge queue-to-local-model end-to-end smoke test returned `E2E_OK`, persisted the response in `team-events.jsonl`, and acknowledged delivery. The first longer-marker attempt was rejected by the test assertion and not counted as a pass.
- GitHub repository reading works in the current ChatGPT session; this does not create a local GitHub CLI credential.
- Existing AI Federation PR #75 already proposes the provider capability catalog (`UnifiedField/ai-providers.json`), plan-only router (`unified-field/ai-federation.mjs`), and local Ollama adapter contract. TeamBridge is scoped to durable runtime/task/message state; consolidate the provider status/capability views before merging both PRs.
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