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
- `uf-tcp-policy.test.cjs`: Node.js built-in test suite (11/11 passed locally on Node.js 22.14.0).\n- `uf-144-council.cjs`: deterministic 144-seat role registry; every seat starts `NOT_CONFIGURED`, with zero live agents claimed.\n- `uf-144-council.test.cjs`: tests for 144-seat count, one-to-one pairing, explicit unconfigured state, and deterministic output.
- `uf-bridge-journal.cjs`: append-only JSONL task journal with idempotency, restart recovery, state transitions, corruption reporting, and stale-target conflict checks. It records metadata only and does not execute commands.
- `uf-bridge-journal.test.cjs`: tests persistence, deduplication, replay conflict detection, state transitions, corruption reporting, and executable-payload rejection.
- `uf-local-worker.cjs`: loopback-only task metadata API; bearer authentication for task routes; no shell execution, network sync, or automatic replay.
- `uf-local-worker.test.cjs`: tests loopback binding, authentication, idempotent enqueue, replay conflict checks, and route rejection.
- `Start-UnifiedFieldWorker.ps1`: PowerShell 5.1 launcher for the local worker.
- `uf-topology.cjs`: deterministic, plan-only clustered topology proposal with bounded inter-cluster fanout; it does not create connections or replicate data.
- `uf-topology.test.cjs`: tests determinism, bounded links, known-node edges, and invalid configurations.
- `uf-topology-cli.cjs`: CLI to produce a topology proposal from a JSON node manifest; no network calls or replication.
- `uf-topology-cli.test.cjs`: CLI input/output and error-path tests.
- `topology-nodes.example.json`: illustrative node manifest; names are examples, not live discovered nodes.
- `.github/workflows/uf-tcp-policy.yml`: CI workflow for policy, council registry, bridge-journal, and topology-planner tests; check GitHub Actions before claiming a green run.

From this directory, run the policy tests with a recent Node.js runtime:

```powershell
node --test .\uf-tcp-policy.test.cjs
```

The dashboard remains read-only and does not yet execute the policy engine, run council seats, dispatch cross-examination tasks, or operate the offline journal as a worker. The journal is the first queue primitive, not a complete online/offline runtime; no local daemon or browser adapter is claimed as operational. A green service-health indicator means an endpoint responded; it is not proof that the 144-role council or end-to-end workflow is operational. Do not represent role records as independent live models unless that independence is separately demonstrated.

## Generate a topology proposal

From PowerShell 5.1 in this directory:

```powershell
node .\uf-topology-cli.cjs --input .\topology-nodes.example.json --replication-factor 2
```

The CLI writes a JSON `PLAN_ONLY` proposal to standard output. It does not establish network connections, discover devices, replicate data, or prove that any listed node is online. Replace the illustrative manifest with an explicitly reviewed inventory before using the output for deployment planning.

## Start the local worker (metadata queue only)

Open Windows PowerShell 5.1 in this directory. Configure a high-entropy token in this session before starting the worker; keep it out of Git and logs:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$env:HEAVENZFIRE_BRIDGE_TOKEN = ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
$rng.Dispose()
& .\Start-UnifiedFieldWorker.ps1
```

The worker prints its loopback address and journal path. In a second PowerShell window, health can be checked with:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8798/health"
```

The token is scoped to the PowerShell session and inherited by the worker process. Restarting in a new session requires setting it again. Task-list and enqueue endpoints require a bearer token. This MVP stores task metadata only; it is not yet a general task executor or a networked mesh.
