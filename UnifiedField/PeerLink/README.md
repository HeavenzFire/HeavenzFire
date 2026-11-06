# HeavenzFire PeerLink v0.1

PeerLink connects a Unified Field control node to one or more compute nodes without requiring Tailscale, a hosted model provider, or inbound ports on the compute node.

## Components

- \`peerlink-hub.cjs\`: authenticated coordinator, task API, peer registry, lease manager, and append-only JSONL event journal.
- \`peerlink-agent.cjs\`: outbound-only worker. It registers, polls for supported tasks, calls its local OpenAI-compatible inference endpoint, and returns results.
- \`peerlink-protocol.cjs\`: protocol validation, request parsing, task bounds, and authentication helpers.
- \`peerlink.test.cjs\`: local integration and recovery tests.

Node.js 18+; no npm dependencies.

## Network modes

### Same device / loopback development

Run the hub on the ARM32 control node:

\`\`\`sh
HF_PEERLINK_TOKEN="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
export HF_PEERLINK_TOKEN
node UnifiedField/PeerLink/peerlink-hub.cjs
\`\`\`

The programmatic API is currently the supported launch surface; a CLI launcher is added in the next integration step. The default bind is \`127.0.0.1:18990\`.

### Local network

For direct LAN access, configure a TLS key and certificate and bind the hub to the intended private interface. Do not use plaintext bearer tokens over Wi-Fi. Restrict the firewall to the private subnet and do not bind to \`0.0.0.0\` unless that exposure is intentional and protected.

### Remote networks

The compute node initiates all connections outbound to the hub. Publish the hub behind a trusted HTTPS reverse proxy (or run the native TLS server) and give the worker the public HTTPS origin. The reverse proxy should forward only PeerLink paths to the loopback hub. Do not forward the hub's HTTP listener directly to the internet.

Launch the worker with `node UnifiedField/PeerLink/peerlink.cjs agent`. The worker requires HTTPS for non-loopback hub URLs. Its inference endpoint is restricted to loopback so prompts are sent only to a runtime on the compute node itself. No inbound port or remote shell is required on the worker. DNS, TLS termination, and remote reachability remain deployment responsibilities; PeerLink does not create a tunnel or bypass NAT by itself.

## Configuration

Hub:
- \`HF_PEERLINK_TOKEN\`: shared bootstrap secret, minimum 32 characters.
- \`HF_PEERLINK_HOST\`: default \`127.0.0.1\`.
- \`HF_PEERLINK_PORT\`: default \`18990\`.
- \`HF_PEERLINK_JOURNAL\`: append-only JSONL event path; default \`state/peerlink-events.jsonl\`.

Agent:
- \`HF_PEERLINK_HUB_URL\`: hub origin; HTTPS required except loopback.
- \`HF_PEERLINK_TOKEN\`: same bootstrap secret, supplied through a protected local environment or secret file loader.
- \`HF_PEERLINK_PEER_ID\`: stable peer ID; default \`heavenzfire-arm64\`.
- \`HF_PEERLINK_INFERENCE_URL\`: local OpenAI-compatible inference origin; default \`http://127.0.0.1:11800\`.
- \`HF_PEERLINK_MODEL\`: fallback model ID.

## Protocol v1

1. Controller submits only \`inference.chat\` tasks with an idempotency key.
2. Agent registers with protocol version, peer ID, capability list, and a random client nonce.
3. Hub echoes the nonce and issues a per-peer session bearer.
4. Agent polls outbound and receives a leased task only when it advertises the matching capability.
5. Agent sends the prompt to its local inference endpoint and posts a bounded result.
6. Hub persists queue, claim, and result events before acknowledging mutations. Expired leases are requeued; in-progress leases are requeued on restart.

Task messages are bounded (32 messages, 24,000 combined characters, 2,048 output tokens). The only task type is \`inference.chat\`. Shell, filesystem, browser, and privileged execution are not implemented.

## Verification

\`\`\`sh
node --test UnifiedField/PeerLink/peerlink.test.cjs
\`\`\`

The tests use loopback HTTP and a mocked inference runtime. They verify protocol behavior and task lifecycle, not a real ARM64 device, LAN TLS setup, public DNS, reverse-proxy configuration, or real model generation.

## v0.1 limitations

- Peer and task status is held in memory; task events are journaled and queued tasks recover after restart.
- Peer sessions must register again after hub restart.
- A single bootstrap secret is shared between controller and worker; rotate it through the local secret-management process.
- Remote deployment requires an HTTPS endpoint that the worker can reach. PeerLink does not provide public hosting, DNS, certificates, or NAT traversal.
- Semantic quality of model responses is not certified by transport completion.
- Privileged operations remain outside the protocol and require the Unified Field approval verifier.
