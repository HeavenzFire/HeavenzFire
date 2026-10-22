# HeavenzFire Permanent Presence

This directory is the durable public handoff point for HeavenzFire cross-AI continuity. It lives in the public `HeavenzFire/HeavenzFire` repository so records do not depend on a single AI conversation or temporary sandbox.

## Canonical links

- [ChatGPT capability registry entry](../interchange/registries/chatgpt_capability_registry_entry_v0.1.0.json)
- [ChatGPT interchange export](../interchange/exports/chatgpt_interchange_export_v0.1.0.json)
- [ChatGPT execution log](../interchange/logs/chatgpt_execution_log_v0.1.0.json)

## Operating contract

1. Treat versioned files in Git as the durable interchange record; each AI session imports and exports explicit files.
2. Do not claim shared memory, cross-platform API access, or private share-URL retrieval without direct evidence.
3. Preserve hashes, execution logs, task IDs, and blocked states. Never convert a reported result into an independently verified result.
4. Keep secrets, private conversation contents, tokens, personal records, and device credentials out of this public repository.
5. The public repository is durable storage, not an always-on runtime. Local agents and phone bridges must report their own heartbeat and reachability separately.
6. Public status must be based on observed checks. An absent or stale heartbeat means `unknown`, not `online`.

## Current status (2026-10-21)

- Cross-AI transfer: explicit file-based interchange supported.
- ChatGPT-side artifact checks: 5/5 passed.
- Original Meta AI schema/test reproduction: blocked until the original schema, example, test script, and log are supplied.
- Live Windows/phone services: not represented as continuously online by this repository.
- Persistent hosted website or 24/7 runtime: not yet verified as deployed.

## Change process

Publish a new versioned artifact rather than silently rewriting evidence. Update this file when a capability or status changes, and include the verification date and source of evidence.
