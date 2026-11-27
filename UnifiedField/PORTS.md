# Unified Field local service ports

These defaults are intentionally distinct so the proposal inbox and model gateway can run at the same time.

| Port | Service | Default bind | Purpose |
|---:|---|---|---|
| 18796 | HeavenzFire API gateway | 127.0.0.1 | Provider adapter and OpenAI-compatible API |
| 18797 | LocalOrchestrator | 127.0.0.1 | Durable task execution and 16-role coordination |
| 18798 | GitHub bridge | 127.0.0.1 | GitHub read/write bridge; writes require a trusted signed approval verifier |
| 18799 | Task inbox | 127.0.0.1 | Durable proposal intake; does not execute tasks |

The task inbox was moved from 18796 to 18799 to remove a real port collision with the API gateway. BrowserBridge, the dashboard, the PowerShell inbox controls, and the GitHub bridge now use the inbox port.

All four services are local-only by default. Do not bind them to 0.0.0.0 or expose them directly to the public internet. Cross-device access must use a separately reviewed authenticated transport and explicit network policy. A healthy local endpoint does not establish that the other services or devices are connected.
