# HeavenzFire PeerLink v0.1

PeerLink connects a Unified Field control node to one or more compute nodes without requiring Tailscale, a hosted model provider, or inbound ports on the compute node.

## Components

- `peerlink-hub.cjs`: authenticated coordinator, peer registry, leased task queue, and append-only JSONL event journal.
- `peerlink-agent.cjs`: outbound-only worker. It registers, polls for supported tasks, calls its local OpenAI-compatible inference endpoint, and returns results.
- `peerlink-protocol.cjs`: protocol validation, bounded request parsing, and authentication helpers.
- `peerlink.cjs`: CLI entrypoint for hub and agent modes.
- `peerlink.test.cjs`: local integration and recovery tests.

Node.js 18+; no npm dependencies.

## Network modes

### Loopback development

On the ARM32 control node, generate a bootstrap secret and launch the hub:

```sh
export HF_PEERLINK_TOKEN="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
node UnifiedField/PeerLink/peerlink.cjs hub
```

Default listener: `127.0.0.1:18990`. Keep the bootstrap secret in a protected local environment; do not commit it or paste it into chat.

### Local network

For direct LAN access, configure a TLS key and certificate and bind the hub to the intended private interface:

```sh
export HF_PEERLINK_HOST="192.168.1.20"
export HF_PEERLINK_TLS_KEY="/secure/path/peerlink.key"
export HF_PEERLINK_TLS_CERT="/secure/path/peerlink.crt"
node UnifiedField/PeerLink/peerlink.cjs hub
```

Use the actual private address of the control node. Restrict the host firewall to the intended private subnet. PeerLink refuses non-loopback plaintext binds.

### Remote networks

The compute node initiates all connections outbound to the hub. Publish the loopback hub behind a trusted HTTPS reverse proxy (or run the native TLS server) and give the worker the public HTTPS origin. The reverse proxy should forward only PeerLink routes to the loopback hub. Do not forward the hub's HTTP listener directly to the internet.

On the ARM64 compute node:

```sh
export HF_PEERLINK_HUB_URL="https://peerlink.example.net/"
export HF_PEERLINK_TOKEN="<same-secret-from-secure-local-secret-store>"
export HF_PEERLINK_PEER_ID="heavenzfire-arm64"
export HF_PEERLINK_INFERENCE_URL="http://127.0.0.1:11800"
node UnifiedField/PeerLink/peerlink.cjs agent
```

The agent requires HTTPS for non-loopback hub URLs. Its inference endpoint is restricted to loopback so prompts are sent only to a runtime on the compute node itself. No inbound port or remote shell is required on the worker.

**Important:** PeerLink supplies the authenticated application transport, not public hosting or NAT traversal. Remote operation still requires a reachable HTTPS hub URL, DNS, valid TLS, and a configured reverse proxy or native TLS listener.

## Configuration

Hub:
- `HF_PEERLINK_TOKEN`: shared bootstrap secret, minimum 32 characters.
- `HF_PEERLINK_HOST`: default `127.0.0.1`.
- `HF_PEERLINK_PORT`: default `18990`.
- `HF_PEERLINK_JOURNAL`: append-only JSONL event path; default `state/peerlink-events.jsonl`.
- `HF_PEERLINK_TLS_KEY` and `HF_PEERLINK_TLS_CERT`: optional native TLS key and certificate; both are required together.

Agent:
- `HF_PEERLINK_HUB_URL`: hub origin; HTTPS required except loopback.
- `HF_PEERLINK_TOKEN`: same bootstrap secret, supplied through a protected local environment or secret-file loader.
- `HF_PEERLINK_PEER_ID`: stable peer ID; default `heavenzfire-arm64`.
- `HF_PEERLINK_INFERENCE_URL`: local OpenAI-compatible inference origin; default `http://127.0.0.1:11800`.
- `HF_PEERLINK_MODEL`: fallback model ID.

## Unified Field orchestrator integration

The existing 16-role LocalOrchestrator can dispatch each specialist request through PeerLink instead of directly calling a provider. On the ARM32 control node, start the PeerLink hub and configure the orchestrator in the same protected shell environment:

```sh
export HF_PEERLINK_TOKEN="<same 32+ character secret used by the worker>"
export HF_PEERLINK_URL="http://127.0.0.1:18990"
export HF_PEERLINK_MODEL="your-remote-model-id"
export HF_ORCHESTRATOR_PROVIDER="peerlink"
node UnifiedField/LocalOrchestrator/orchestrator.cjs
```

The orchestrator remains loopback-bound on port 18797. Each of its 16 specialist role calls becomes a bounded PeerLink inference task; the remote worker polls and executes tasks against its own loopback inference runtime. The orchestrator still requires explicit task approval before dispatch. Configure the worker's model ID to match the model installed on the compute node. The hub's task queue serializes work naturally when only one worker is connected.

The API gateway at port 18796 is not required for this PeerLink path: PeerLink is the authenticated transport from the orchestrator to the remote worker's local inference adapter.

## Protocol v1

1. Controller submits only `inference.chat` tasks with an idempotency key.
2. Agent registers with protocol version, peer ID, capability list, and a random client nonce.
3. Hub echoes the nonce and issues a per-peer session bearer.
4. Agent polls outbound and receives a leased task only when it advertises the matching capability.
5. Agent sends the prompt to its local inference endpoint and posts a bounded result.
6. Hub persists queue, claim, and result events before acknowledging mutations. Expired leases are requeued; in-progress leases are requeued on restart. Heartbeats extend active leases during long generations.

Task messages are bounded (32 messages, 24,000 combined characters, 2,048 output tokens). The only task type is `inference.chat`. Shell, filesystem, browser, and privileged execution are not implemented.

## Verification

```sh
node --test UnifiedField/PeerLink/peerlink.test.cjs
```

The tests use loopback HTTP and a mocked inference runtime. They verify protocol behavior and task lifecycle, not a real ARM64 device, LAN TLS setup, public DNS, reverse-proxy configuration, or real model generation. The dedicated GitHub Actions workflow performs syntax checks and runs this test file on pull requests.

## v0.1 limitations

- Peer and task status is held in memory; task events are journaled and queued work recovers after restart.
- Peer sessions must register again after hub restart.
- A single bootstrap secret is shared between controller and worker; rotate it through the local secret-management process.
- Remote deployment requires an HTTPS endpoint that the worker can reach. PeerLink does not provide public hosting, DNS, certificates, or NAT traversal.
- Semantic quality of model responses is not certified by transport completion.
- Privileged operations remain outside the protocol and require the Unified Field approval verifier.
