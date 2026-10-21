# Unified Field Command Hub Dashboard

A read-only, loopback-only dashboard for observing the existing HeavenzFire Unified Field services, Digital Brain graph, 144A task ledger, guardian snapshot, and public GitHub repository metadata.

## Run on Windows

Requirements: Node.js 18+ and the existing HeavenzFire local services.

In Windows PowerShell:

```powershell
Set-Location "$env:USERPROFILE\HeavenzFire\UnifiedField\QuantumLab"
node .\UnifiedField-Dashboard-Server.cjs
```

Leave that terminal running and open a Chrome tab to:

`http://127.0.0.1:8800/`

Health check: `http://127.0.0.1:8800/health`

## Security boundaries

- The server binds only to `127.0.0.1`; it is not a LAN or public endpoint.
- Only GET requests are accepted. The dashboard does not execute shell commands or modify tasks.
- The local API reads the existing `HeavenzFire\144A\tasks` records and guardian snapshot.
- GitHub data is fetched from the public API. No GitHub token or other secret is stored.
- The ChatGPT link opens ChatGPT; it is not a private API connection to the active conversation.
- Service health indicates reachability, not proof of end-to-end correctness. Workflow roles are not counted as separate live model processes.

## Files

- `UnifiedField-Dashboard.html`: browser UI, polling, graph visualization, GitHub public metadata.
- `UnifiedField-Dashboard-Server.cjs`: read-only local aggregator for service health, brain state, task records, and guardian snapshot.
