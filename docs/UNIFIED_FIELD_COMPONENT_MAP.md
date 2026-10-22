# Unified Field — Existing Repository Component Map

This document coordinates implementation across existing HeavenzFire repositories. It is an integration register, not a claim that all listed components are operational.

## Verified starting point

| Repository | Observed artifact | Integration role | Status |
|---|---|---|---|
| [HeavenzFire/Spirit_Engine](https://github.com/HeavenzFire/Spirit_Engine) | Local recovery scripts, tests, loopback-only Guardian status service; branch adds a SQLite hash-chained event ledger | Recovery, durable local event history, integrity checks | Ledger implementation is in draft PR #1; 10 targeted tests passed in a Windows Python environment |
| [HeavenzFire/HeavenzFire](https://github.com/HeavenzFire/HeavenzFire) | Existing project chronicle and technical milestone record in README | High-level project index and cross-repository integration tracking | This document adds the component map; runtime behavior is not inferred from the chronicle alone |
| [HeavenzFire/5D-FRAMEWORK](https://github.com/HeavenzFire/5D-FRAMEWORK) | README contains architecture descriptions and illustrative consistency/replication examples | Candidate for later consistency and replication review | Not accepted as a runtime dependency until source, tests, and executable behavior are verified |

## Integration rules

1. Do not duplicate the ledger implementation across repositories. `Spirit_Engine` owns the first local event-ledger implementation.
2. Repositories may integrate through versioned packages, explicit APIs, or documented file-based interchange; do not silently copy code between repos.
3. Treat README claims, diagrams, static examples, and simulated outputs as hypotheses until an executable test demonstrates behavior.
4. No peer network listener or remote task execution is enabled by this component map.
5. Never commit API keys, private keys, credentials, local database files, snapshots, or personal data.
6. Every integration must declare its input/output schema, trust boundary, failure behavior, test command, and rollback method.

## Dependency-ordered implementation plan

### UF-01 — Local event ledger
- Owner: `Spirit_Engine`
- Deliverable: SQLite event store, SHA-256 hash chain, JSON evidence export.
- Gate: unit tests pass on Windows and CI; documented limitation that hash chaining is not a signature.
- Tracking: [draft PR #1](https://github.com/HeavenzFire/Spirit_Engine/pull/1).

### UF-02 — Portable event envelope
- Define schema version, stable event ID, origin node ID, event kind, payload digest, creation time, and signature metadata.
- Add schema validation and backward-compatibility tests before network transport.
- Use maintained cryptographic libraries for signatures; do not invent a custom signature algorithm.

### UF-03 — Import and reconciliation
- Implement duplicate-event handling, invalid-envelope rejection, chain-fork detection, bounded import size, and deterministic reconciliation.
- Test repeated import, out-of-order delivery, corrupted records, and recovery after interruption.

### UF-04 — Two-node loopback prototype
- Add an authenticated, explicit allowlist-based transport only after UF-02 and UF-03 pass.
- Bind to loopback by default. No unauthenticated `0.0.0.0` listener.
- Test invalid identity, replay, oversized payload, disconnect/reconnect, and graceful shutdown.

### UF-05 — Repository adapters
- Audit each candidate repository's actual source and tests.
- Integrate only through a versioned interface; keep adapters optional and independently testable.
- Record per-repository pass/fail evidence and do not label static simulations as operational.

## Acceptance criteria for the Unified Field

The first cross-repository release is not complete until:
- each component has a named repository owner and versioned interface;
- a clean checkout can run the documented tests;
- a two-node test proves authenticated event transfer and integrity validation;
- offline operation and reconnection are demonstrated;
- failure modes and rollback are documented;
- CI results are linked to the exact commit under review.

## Current evidence limitations

The targeted local tests were run against fetched source files in an isolated workspace because a full clone of the large repository exceeded available memory. GitHub Actions status is not yet confirmed. The peer transport, public-key identity, distributed consensus, and cross-repository runtime integration remain future work, not current capabilities.
