# Dashboard Mesh Integration Evidence

Status: applied to the connected Windows installation and verified locally. The installed dashboard source currently lives outside this GitHub repository under `C:\Users\rucke\HeavenzFire\UnifiedField\QuantumLab`; this document records the integration contract and test evidence rather than claiming the full installed dashboard source is vendored here.

## Installed changes

- `UnifiedField-Dashboard-Server.cjs`: added bounded `POST /api/mesh/enqueue` and `GET /api/mesh/task?task_id=...` routes. The server validates task types and fields, applies a request-size cap, checks browser Origin, and proxies to the loopback-only authenticated bridge on port 8081.
- `UnifiedField-Dashboard-Server.cjs`: extended its read-only endpoint inventory to include the coordinator (8080), bridge (8081), and workers (18101-18103).
- `UnifiedField-Dashboard.html`: added a Mesh Task Console for bounded hash tasks and allowlisted local model tasks. The UI polls persisted task state and explicitly says shell commands are not accepted. Model task controls are operator-initiated and may consume RAM.
- `Test-HeavenzFireMeshAdversarial.ps1`: repeatable Windows PowerShell 5.1 acceptance test; mirrored in this repository under `tools/mesh/`.
- Pre-change backups were preserved alongside the installed dashboard files with suffix `.bak-tesla-grid-20261021`.

## Verification results

- Node syntax check passed for the dashboard server and embedded browser JavaScript.
- Existing Node dashboard tests: 12 passed, 0 failed after aligning one stale test assertion with the worker's actual local Ollama endpoint (11434).
- Dashboard overview returned 14 configured services and all five mesh endpoints healthy.
- End-to-end dashboard-to-queue-to-worker-to-persisted-read canary completed successfully on worker `hf-worker-18101`, attempt 1.
- Adversarial suite passed: dashboard health; five mesh endpoints visible; unauthenticated coordinator stats rejected with HTTP 401; unsupported shell task rejected with HTTP 400; cross-origin enqueue rejected with HTTP 403; oversized hash input rejected; invalid rounds rejected; unapproved model rejected; all mesh listeners confirmed loopback-only; and a valid canary completed and was read back from persisted state.

## Remaining work

- Add a read-only Watchtower journal/resource summary to the dashboard.
- Test sustained stability, shutdown/restart, and reboot recovery.
- Do not enable model batch inference until RAM headroom improves; the latest post-mesh-recovery snapshot was about 1.29 GB available RAM and 8.45 GB free on C:.
