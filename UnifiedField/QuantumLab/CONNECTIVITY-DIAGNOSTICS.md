# Unified Field Connectivity Diagnostics

`Test-UnifiedFieldConnectivity.ps1` is a read-only Windows PowerShell 5.1 diagnostic. It does not restart services, change firewall rules, expose ports, or modify Tailscale settings.

## Run on the Windows 11 machine

From PowerShell 5.1 in this directory:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\Test-UnifiedFieldConnectivity.ps1
```

If the script is copied from GitHub and Windows marks it as downloaded, use the process-scoped command above only if needed; do not change the machine-wide execution policy. Alternatively, run the file from a trusted local checkout.

It checks:
- Relevant process names and whether the Tailscale CLI can report status.
- Local Tailscale-range IPv4 addresses.
- Listener bindings and owning process IDs for the worker, dashboard, Avatar Body, Ollama, gateway, orchestrator, and agent ports.
- HTTP health/API reachability on loopback.
- Whether selected ports answer TCP connections through the machine's own tailnet address.

## Interpret results carefully

- `LOCAL_HTTP` is a test from the Windows machine to its own loopback interface.
- `SELF_TAILNET_PROBE` is a test from Windows to its own tailnet address. It is not a test from Android.
- If local HTTP works but a self-tailnet probe fails, inspect the listener's bind address and firewall profile before changing anything.
- If self-tailnet works but Android still cannot connect, check the current Windows tailnet IP, both peer statuses, and tailnet ACL/grants.
- A listening port is not proof of a healthy application. A health response is not proof of Android-to-Windows reachability.
- The worker at port 8798 is a task-metadata API today, not a general remote command executor.

The script prints diagnostic process IDs and local addresses but does not intentionally print environment variables or access tokens. Review output before sharing it publicly.
