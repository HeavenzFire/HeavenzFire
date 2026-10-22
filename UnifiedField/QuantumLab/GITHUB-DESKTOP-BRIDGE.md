# GitHub-mediated Windows desktop bridge

## Recommended connection model

Use a dedicated GitHub Actions self-hosted runner on the Windows PC. The PC initiates an outbound connection to GitHub and polls for jobs; GitHub does not need an inbound port to the PC. This avoids Desktop Commander quota dependence.

This is not SSH and does not provide an interactive terminal. It is a remote-job channel. If an interactive SSH shell is a hard requirement, that requires a separately configured SSH server/client and key management.

## Setup outline

1. In the repository, open Settings → Actions → Runners → New self-hosted runner.
2. Select Windows and x64, then follow the exact registration commands GitHub shows for this repository. Do not paste registration tokens into chat or commit them.
3. Install the runner in a dedicated directory, add a custom label `heavenzfire-desktop`, and use a dedicated least-privilege Windows account. Do not run it elevated as Administrator.
4. Initially run it interactively. Confirm GitHub shows the runner as online before using it.
5. Start with manual-only workflows that expose fixed operations: connection check, loopback runtime health, and selected tests. Do not accept arbitrary command strings, paths, URLs, or scripts from workflow inputs or issue bodies.
6. Verify an actual run completes on the Windows runner before declaring the desktop connected.

## Security requirements

- Use a dedicated repository runner, not an organization-wide runner.
- Never run untrusted pull-request code on the runner. Do not add `pull_request_target` or automatic PR execution.
- Review every workflow change before merging because workflow code executes on the local machine under the runner account.
- Keep repository permissions read-only unless a specific workflow requires more.
- Do not emit credentials, environment dumps, or sensitive filesystem inventories to logs.
- Treat this as remote code execution within the runner account's permissions, not a harmless status monitor.

## Existing implementation findings

The current `UnifiedField/QuantumLab/uf-local-worker.cjs` is loopback-only and explicitly reports `no-network-sync`, `no-automatic-replay`, and `no-live-mesh`. It is not yet the GitHub connection. The current `.github/workflows/blank.yml` runs on `ubuntu-latest`, not the Windows desktop.

## Verification status

This document is a design and setup guide only. It does not establish that a runner is installed or online. The desktop is verified only after the runner is registered, online, and a manual workflow job succeeds on it.
