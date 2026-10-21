# HeavenzFire Bridge — online/offline control-plane plan

This folder's plugin is the coordination layer. It does not silently install a local daemon or imply that the user's Chrome/Windows machine is connected to ChatGPT.

## Target design
- **Cloud coordination:** connected GitHub operations and repository evidence when online.
- **Local worker:** Windows PowerShell 5.1-compatible, loopback-only Node.js service.
- **Durable offline queue:** append-only JSONL journal, idempotency keys, replay after reconnection, conflict detection.
- **Adapters:** GitHub, browser automation, local desktop tasks, Ollama/brain/orchestrator.
- **Handshake:** protocol version + capability set + nonce echo + scope declaration.
- **Policy:** UF-TCP ternary gate; unknown/stale evidence abstains, mandatory invariant failure rejects.
- **Dashboard:** actual adapter status and task provenance; never present role slots as live agents.
- **Fallback:** queue locally while offline; continue local tasks; pause only network-dependent work.

## Delivery sequence
1. Policy and council registry: implemented in the PR branch; local policy suite was run on Node.js 22.14.0 (11 passed). Council tests are added to CI but must be confirmed through an actual GitHub Actions run.
2. Adapter contract and offline queue: next implementation stage.
3. Local worker and PowerShell launcher.
4. Dashboard integration, browser adapter, GitHub adapter.
5. Fault-injection tests: network loss, duplicate replay, corrupt journal line, worker restart, stale commit, adapter timeout.
6. End-to-end verification on Windows.

## Non-goals
No public listener, arbitrary remote shell, secret collection, silent elevation, auto-merge, or unverified claim of continuous execution. Local worker execution and Chrome automation require actual installation and verification.
