# GitHub-mediated Windows desktop bridge

## What this implementation is

This is a manually dispatched, bounded remote-job bridge for an explicitly registered Windows self-hosted GitHub Actions runner. The PC initiates outbound HTTPS connections to GitHub; no inbound port-forwarding is required. It is not an interactive remote desktop stream or a general-purpose shell.

Implemented files:

- `.github/workflows/heavenzfire-desktop-bridge.yml` — manual-only workflow with three fixed operations, read-only repository permissions, concurrency control, and a ten-minute timeout.
- `UnifiedField/QuantumLab/heavenzfire-desktop-bridge.ps1` — PowerShell 5.1-compatible worker with a fixed operation allowlist, bounded loopback health probes, structured JSON output, protocol version, session nonce echo, capability list, UTC timestamp, and repository/revision identity.

## Setup

1. In the repository, open Settings → Actions → Runners → New self-hosted runner.
2. Select Windows and x64. Follow GitHub's current registration instructions locally. Never paste the runner registration token into chat or commit it.
3. Install a **repository-scoped** runner in a dedicated directory. Add the custom label `heavenzfire-desktop`.
4. Run it under a dedicated, least-privilege Windows account, not an elevated Administrator account. Start it interactively for initial verification.
5. Confirm GitHub reports the runner as online. Then use Actions → HeavenzFire GitHub Desktop Bridge → Run workflow, choosing one fixed operation.
6. Start with `connection_check`. The workflow must report `HF_HANDSHAKE=VALID` and a matching protocol version, nonce, operation, repository, and revision. Only then is the GitHub-mediated runner path verified.

## Fixed operations

- `connection_check`: checks that the job is running on Windows and that Node.js and Git respond to version probes.
- `local_runtime_health`: probes only known loopback endpoints for Ollama, the HeavenzFire gateway, orchestrator, and agent. It reports unreachable endpoints as degraded; it does not modify services.
- `unified_field_tests`: runs three named Node.js regression test files. It does not accept arbitrary commands, paths, URLs, or scripts as inputs.

## Security requirements

- Review workflow and worker changes before running them on the self-hosted machine: workflow code executes with the runner account's permissions.
- Never execute untrusted pull-request code on this runner. Keep this workflow manual-only; do not add `pull_request_target` or automatic PR execution.
- Use a dedicated repository runner, not an organization-wide runner. Do not run it as Administrator.
- Keep repository permissions read-only unless a specific reviewed workflow requires otherwise.
- Do not emit credentials, environment dumps, usernames, or sensitive filesystem inventories to logs.
- Do not expose RDP or a local control API directly to the public internet.
- Stop the runner service/process to revoke this job channel. Also remove the runner in repository Settings → Actions → Runners when it is no longer needed.

## Verification boundary

Code committed to a branch is not proof of runtime connectivity. The runner must be registered and online, and a manual workflow run must finish on that runner with a valid nonce/protocol/identity handshake. A successful run proves only that the selected bounded job executed on the Windows runner; it does not give this ChatGPT conversation an interactive desktop stream, and it does not automatically grant this session a workflow-dispatch tool.

The existing `UnifiedField/QuantumLab/uf-local-worker.cjs` is loopback-only and explicitly does not implement network sync, automatic replay, or a live mesh. This runner is a separate, GitHub-mediated job channel.