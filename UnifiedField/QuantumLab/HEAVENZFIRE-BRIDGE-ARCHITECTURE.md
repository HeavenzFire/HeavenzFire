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
2. Append-only offline task journal and deterministic topology planner: source and tests added; CI verification pending.
3. Adapter contract and local worker: next implementation stage.
4. Local worker and PowerShell launcher.
5. Dashboard integration, browser adapter, GitHub adapter.
6. Fault-injection tests: network loss, duplicate replay, corrupt journal line, worker restart, stale commit, adapter timeout.
7. End-to-end verification on Windows.

## Non-goals
No public listener, arbitrary remote shell, secret collection, silent elevation, auto-merge, or unverified claim of continuous execution. Local worker execution and Chrome automation require actual installation and verification.

## Fractal topology planning (new, plan-only)

- `uf-topology.cjs` creates a deterministic proposal for clustered local nodes, cluster anchors, intra-cluster rings, and a bounded inter-cluster overlay.
- `uf-topology.test.cjs` covers determinism, known-node edges, no self-loops, bounded overlay fanout, and invalid inputs.
- The planner performs no network operations and does not replicate data, create live connections, or launch nodes. A planned edge is not evidence of connectivity.
- The option named `replicationFactor` bounds overlay neighbor fanout; it does not specify the number of stored data copies. Data replication and consensus must be separately designed around consistency, trust boundaries, and failure domains.
