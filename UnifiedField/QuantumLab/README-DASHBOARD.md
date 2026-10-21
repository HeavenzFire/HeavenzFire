# Unified Field Command Hub Dashboard

A read-only, loopback-only dashboard for observing existing HeavenzFire Unified Field services, Digital Brain graph state, 144A task records, guardian snapshot, and public GitHub repository metadata.

## One-command launch on Windows

In Windows PowerShell 5.1:

```powershell
& "$env:USERPROFILE\HeavenzFire\UnifiedField\QuantumLab\Start-UnifiedFieldDashboard.ps1"
```

The launcher starts the Node.js server only if its local health endpoint is not already responding, then opens a Chrome tab at `http://127.0.0.1:8800/`. To run the server manually instead:

```powershell
Set-Location "$env:USERPROFILE\HeavenzFire\UnifiedField\QuantumLab"
node .\UnifiedField-Dashboard-Server.cjs
```

Health check: `http://127.0.0.1:8800/health`

## Security boundaries

- The server binds only to `127.0.0.1`; it is not a LAN or public endpoint.
- Only GET requests are accepted. The dashboard does not execute shell commands or modify tasks.
- The local API reads existing `HeavenzFire\144A\tasks` records and the guardian snapshot.
- GitHub data is fetched from the public API. No GitHub token or other secret is stored.
- The ChatGPT link opens ChatGPT; it is not a private API connection to the active conversation.
- Service health indicates reachability, not proof of end-to-end correctness. Workflow roles are not counted as separate live model processes.

## Files

- `UnifiedField-Dashboard.html`: browser UI, polling, graph visualization, GitHub public metadata.
- `UnifiedField-Dashboard-Server.cjs`: read-only local aggregator for service health, brain state, task records, and guardian snapshot.
- `Start-UnifiedFieldDashboard.ps1`: PowerShell 5.1-compatible launch helper.

## Ternary consensus and 144-seat council (implementation status)

The proposed protocol and role architecture are documented in:
- `UF-TCP-SPEC.md`: deterministic ternary decision policy and evidence contract.
- `UF-144-COUNCIL-ARCHITECTURE.md`: 72 proposal-side roles and 72 counter-examination roles.
- `uf-tcp-policy.cjs`: pure policy evaluator; no network, filesystem, model calls, or side effects.
- `uf-tcp-policy.test.cjs`: Node.js built-in test suite.

From this directory, run the policy tests with a recent Node.js runtime:

```powershell
node --test .\uf-tcp-policy.test.cjs
```

The dashboard remains read-only and does not yet execute the policy engine, run council seats, or dispatch cross-examination tasks. A green service-health indicator means an endpoint responded; it is not proof that the 144-role council or end-to-end workflow is operational. Do not represent role records as independent live models unless that independence is separately demonstrated.
