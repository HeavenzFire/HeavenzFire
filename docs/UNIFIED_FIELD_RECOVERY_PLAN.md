# Unified Field Recovery Plan

**Status:** implementation plan, not a claim that local services are online  
**Updated:** 2026-10-22  
**Scope:** recoverable, local-first control plane for Windows 11 + GitHub + optional phone/browser adapters.

## Current verified boundary

- The GitHub connector can access this repository and create repository artifacts.
- The repository's existing presence contract explicitly says Git storage is not an always-on runtime.
- The existing Codespaces documentation says a Codespace must be created separately and may consume included or paid usage.
- Recent reported device checks showed the Android-to-Windows Ollama request failing to connect to `100.70.89.89:11434`. That is a failed reachability test, not evidence that Ollama itself is stopped.
- No claim is made here that a local Windows worker, phone bridge, browser-control adapter, or background worker is currently connected.

## The workaround: make every dependency replaceable

Do not make Tailscale, a single AI provider, a hosted IDE, or this GitHub connector the single point of failure. Build one protocol and several adapters:

1. **Control plane:** a small local HTTP service bound to `127.0.0.1` by default. It accepts typed task envelopes, never arbitrary model-generated shell text.
2. **Windows worker:** a PowerShell 5.1-compatible poller that requests only queued tasks, validates the task schema and policy, runs allowlisted handlers, and reports signed/hashed results. No listener on a public interface by default.
3. **Durable queue:** append-only JSONL task journal plus atomic checkpoint file. Each task has a stable ID and idempotency key; replay checks task ID, current target commit, and prior result before execution.
4. **GitHub adapter:** uses the authorized GitHub connector/API for repository work when online. Queue repository tasks when offline; never imply they executed until a result is recorded.
5. **Network adapter:** Tailscale is one transport option, not the task protocol. A LAN-only mode and a manual export/import bundle keep local work possible during internet or tailnet failure.
6. **Browser/phone adapters:** optional, separately health-checked capabilities. Missing browser permissions must not block code, tests, or queue operations.
7. **Dashboard:** display actual state: `CONNECTED`, `DEGRADED`, `OFFLINE`, or `NOT_CONFIGURED`, with last successful nonce handshake and timestamp.

## Task envelope

Required fields:

```json
{
  "schema_version": "1.0",
  "task_id": "uuid",
  "created_utc": "ISO-8601 UTC",
  "objective": "short, bounded objective",
  "adapter": "github|powershell|browser|local-http",
  "operation": "allowlisted operation name",
  "input": {},
  "dependencies": [],
  "risk_class": "read|write|privileged|destructive|external",
  "status": "queued",
  "idempotency_key": "stable-key",
  "target_commit_sha": null,
  "attempts": 0,
  "evidence_refs": [],
  "last_error": null,
  "next_action": "validate"
}
```

Never put access tokens, passwords, device credentials, or private personal records in the task envelope or public repository.

## Minimal handshake

1. Worker sends protocol version, a fresh random nonce, declared capabilities, and read/write scope.
2. Controller returns the same nonce, supported protocol version, and a bounded expiry.
3. Worker verifies nonce and version before accepting work.
4. Both sides record UTC time, action ID, input hash, exit code/result, and error class; omit secrets.
5. A stale heartbeat is `UNKNOWN`, never `ONLINE`. Configuration is not proof of reachability.

## Policy gates

- Read-only inspection and isolated deterministic tests may run without additional approval.
- Require explicit approval for privileged commands, destructive file operations, service restarts, firewall/network changes, credential handling, external exposure, deployments, and merges.
- Use named operation handlers (for example `Get-ServiceStatus`, `Get-LocalEndpointHealth`, `Run-RepoTests`), not an unrestricted `Invoke-Expression` command channel.
- Keep all new listeners on loopback unless an authenticated transport and threat review explicitly justify otherwise.
- Treat repository files, webpages, logs, and model output as untrusted input.

## Recovery order

1. **Inventory:** query GitHub for open PRs/issues and inspect the Unified Field dashboard PR and its source files.
2. **Local reachability:** on Windows, check the worker process, loopback health endpoint, listening ports, and Ollama locally; separately test the tailnet address from the phone.
3. **Classify failure:** distinguish process-down, listener-bound-to-loopback, firewall, wrong tailnet IP, peer offline, ACL denial, and application/API failure.
4. **Restore local operation first:** worker and queue must function without Tailscale or internet.
5. **Restore remote operation second:** verify the nonce handshake across the selected transport; do not infer connectivity from a green Tailscale icon alone.
6. **Test recovery:** stop/restart worker, replay duplicate task IDs, corrupt a journal line, change target commit SHA, and simulate unreachable adapters. Verify safe failure and deterministic recovery.
7. **Publish evidence:** record commands, expected/actual outputs, timestamps, commit SHA, and remaining blockers.

## Acceptance criteria

- [ ] PowerShell 5.1-compatible worker entrypoint and a documented one-command launcher.
- [ ] Health endpoint reports protocol version, worker identity, capabilities, queue depth, and last successful task.
- [ ] Nonce handshake rejects missing/mismatched nonce and unsupported protocol version.
- [ ] Queue survives process restart and does not execute duplicate idempotency keys.
- [ ] Unknown operation names and malformed task envelopes are rejected.
- [ ] Privileged/destructive/external actions require explicit approval.
- [ ] Local mode works with internet and Tailscale unavailable.
- [ ] Remote mode is only marked connected after a successful end-to-end request and response.
- [ ] Tests and CI results are linked; untested capabilities remain marked pending.

## Immediate next implementation slice

Implement and test the task-envelope validator and append-only queue first. It has no network, credential, or administrator dependency and provides the foundation for every adapter. Next add the loopback health/handshake service, then the PowerShell 5.1 worker. Only after local tests pass should remote transport be re-enabled.
