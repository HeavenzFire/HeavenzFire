# AGQI Mycelial Intelligence Fabric v0.1

## Purpose
The Mycelial Fabric is the message-routing substrate for AGQI inside HeavenzFire Unified Field. Models, specialist agents, devices, memory services, verifiers, and user interfaces are represented as independently addressable nodes connected by policy-constrained links.

This is additive to the existing inference fabric and local orchestrator. It does not replace their scheduler, provider registry, task ledger, or the user's current local runtime configuration.

## Model
- Node: stable identity, kind, trust domain, capabilities, subscriptions, lifecycle state.
- Link: directed connection with bounded cost and topic allowlist; bidirectionality is explicit.
- Envelope: versioned message identity, sender, recipient, topic, correlation ID, creation time, expiry, hop limit, JSON payload.
- Route: lowest-cost eligible path through active nodes and topic-permitted links.
- Transport adapter: boundary for real local IPC, loopback HTTP, WebSocket, or authenticated remote-node delivery.
- Conversation store: durable history keyed by agent and conversation; should reuse the existing persistence strategy rather than create a competing task ledger.

## Mycelial behavior
1. Branching: nodes may have multiple permitted links and messages route over the lowest-cost eligible path.
2. Local adaptation: paused/offline nodes are excluded from route selection.
3. Selective propagation: topics and subscriptions prevent indiscriminate broadcast.
4. Bounded propagation: payload size, TTL, and hop count are enforced.
5. Delivery semantics: message IDs support deduplication; failed transport delivery releases the in-memory dedupe marker for retry.
6. Partial resilience: broadcasts report per-recipient outcomes rather than claiming all-or-nothing success.

## Security invariants
- Node IDs and topics are validated.
- Publishers require publish:topic, publish:*, or * capability.
- Recipients must subscribe to the topic.
- Links have topic allowlists.
- Inactive nodes cannot route or receive.
- Payloads are JSON-only and size bounded.
- TTL and hop limits prevent unbounded propagation.
- Payloads are never executed as code.
- v0.1 does not claim encryption, cross-machine authentication, or durable delivery. Those guarantees belong in transport and persistence adapters and must be tested before federation.

## Integration sequence
1. Keep TermuxAgent/fabric.cjs RuntimeRegistry and FabricScheduler as the inference execution substrate.
2. Integrate this module as the logical message topology and routing layer.
3. Add durable conversation storage with cross-process-safe append and recovery tests.
4. Add local transport adapters first; keep services loopback-only.
5. Add authenticated encrypted node transport only after identity provisioning, replay protection, key rotation, and authorization tests.
6. Connect the LocalOrchestrator's 16 roles as logical nodes. They remain roles sharing an inference engine unless separate model processes are deployed.
7. Add voice identities and speech adapters as nodes/services, with explicit consent and provider selection.

## Resource policy
Retain the conservative low-resource local profile: one active inference task at a time until measured memory headroom supports more. Message routing must not increase model inference concurrency.

## Acceptance criteria
- Deterministic route selection and topology introspection.
- Authorization, subscription, link-topic, inactive-node, TTL, payload-size, and hop-limit enforcement.
- Duplicate delivery suppression and retry after transport failure.
- Broadcast fan-out reports each peer's result.
- Unit tests pass on supported Node.js versions.
- No claim of multi-machine federation until a real authenticated transport adapter is implemented and tested.
