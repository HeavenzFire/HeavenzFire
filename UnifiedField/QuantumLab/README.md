# HeavenzFire QuantumLab

This local lab reuses existing HeavenzFire assets rather than downloading another stack.

## Components

- Invoke-HeavenzFireQuantumLab.ps1 runs the existing QuantumSolver regression suite, the Qiskit Aer classical-circuit benchmark, an exact HFQLOSS1 compression/decompression round trip, and a read-only health/search check of the local web-research connector.
- Invoke-HeavenzFireOnlineResearch.ps1 sends a query to the existing loopback-only web-search service, passes bounded HTTPS search snippets to a local Ollama model, and prints a source-linked synthesis.
- Reports, logs, the compressed test artifact, and the reconstructed test payload are written beneath artifacts.

## Run in Windows PowerShell 5.1

```powershell
Set-Location 'C:\Users\rucke\HeavenzFire\UnifiedField\QuantumLab'
.\Invoke-HeavenzFireQuantumLab.ps1
.\Invoke-HeavenzFireOnlineResearch.ps1 -Query 'Qiskit Aer simulator noise models'
```

No packages are installed and no model is downloaded. The runner stops if C: has less than 2 GiB free. It uses the existing Miniconda Python environment and existing local services.

## Evidence boundaries

- Qiskit Aer is a classical simulation of quantum circuits; no physical quantum hardware is used.
- The test suite exercises a small set of circuits (interference, Bell state, toy Grover search, a depolarizing-noise run, GHZ statevector scaling, and a seeded repetition-code model). These tests do not prove quantum advantage or validate every proposed theory.
- HFQLOSS1 verifies exact reconstruction for the test JSON. It does not establish that the lossy HFQ/gyroid formats are lossless or validate every existing artifact.
- Online research uses search-result snippets, not guaranteed full-page reading. External content is treated as untrusted; it is not executed.
- All services remain bound to loopback. This is not a remote/public API.
## Unified Field command dashboard

Launch the loopback-only command dashboard with Windows PowerShell 5.1:

```powershell
& "$env:USERPROFILE\HeavenzFire\UnifiedField\QuantumLab\Start-UnifiedFieldDashboard.ps1"
```

Open http://127.0.0.1:8800/. The dashboard exposes a live service overview, the current local model-worker run, latest worker artifact, task snapshots, guardian state, and the Digital Brain visualization when available. `POST /api/worker/run` starts a fixed local Ollama smoke-test batch; the request does not accept arbitrary commands.

Run the dashboard regression tests:

```powershell
node --test "$env:USERPROFILE\HeavenzFire\UnifiedField\QuantumLab\UnifiedField-Dashboard.test.cjs"
```

Safety boundary: worker outputs are untrusted text and are not executed. The service binds to 127.0.0.1 only. The mesh coordinator is reported offline if its health endpoint fails; a dashboard health response alone is not proof that every subsystem is online.

## Mesh coordinator authentication repair

The local mesh launcher creates a fresh 256-bit random bearer token in memory and passes it through the inherited environment to the coordinator and all three workers. It does not write the token to disk. The coordinator remains bound to loopback. Startup checks all four health endpoints and stops if any endpoint is unhealthy. The launcher uses bounded local port checks and writes process output to the local mesh logs directory.

Live repair verification on 2026-10-21:
- Coordinator `127.0.0.1:8080/health`: healthy; 101 recorded tasks (99 completed, 2 failed), queue empty at verification time.
- Workers `18101`, `18102`, `18103`: all healthy and reporting `authenticated: true`.
- Dashboard `/api/overview`: mesh healthy; all 10 monitored services healthy.
- Prior failure evidence: worker polling was repeatedly rejected with HTTP 401 when the shared token was absent.

## Unified Field mesh task console

- The dashboard includes a bounded task console for `hash_task` smoke tests and allowlisted local `model_task` prompts. It does not accept shell commands or execute model-generated code.
- Runtime coordinator and workers remain under `C:\Users\rucke\heavenzfire-capsule-v02\mesh-v0.1`; the loopback dashboard bridge is launched as a child of `mesh_launcher.ps1`.
- The bridge keeps the bearer token in its inherited process environment and proxies only bounded enqueue/status operations. The token is not written to disk or sent to dashboard JavaScript.
- The launcher expects ports 8080 (coordinator), 8081 (dashboard bridge), and 18101–18103 (workers) to be free. Restarting the existing mesh is required before the bridge and task console become live.
- Verification completed so far: JavaScript syntax checks, PowerShell parser, Python bridge compilation, and 4 original dashboard regression tests. New task-console regression test is being added; end-to-end live queue execution remains pending until the updated launcher is restarted and a smoke task completes.
