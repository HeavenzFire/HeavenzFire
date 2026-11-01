# Orloj adapter

This is a small, independent HTTP adapter for the Orloj control plane. It does not vendor or modify Orloj source.

- **Upstream:** https://github.com/OrlojHQ/orloj
- **Pinned inspection revision:** `00091ac69b8f72a20969e7b02a73248b075125f2`
- **Upstream license observed at that revision:** Apache-2.0
- **Adapter license:** repository license applies to this original adapter code; no Orloj source is copied here.
- **API contract:** Orloj `/healthz`, `/v1/capabilities`, `POST /v1/tasks`, and `GET /v1/tasks/{name}`.

## Configuration

- `HF_ORLOJ_URL`: Orloj HTTP origin; defaults to `http://127.0.0.1:8080`.
- `ORLOJ_API_TOKEN`: optional bearer token. Supply it at runtime; never commit it.
- `HF_ORLOJ_SYSTEM`: existing Orloj `AgentSystem` name used when dispatching an approved task.

The adapter deliberately accepts only plain HTTP loopback origins. Put any remote Orloj deployment behind a separately reviewed authenticated local gateway; do not weaken this boundary by pointing the adapter at a public host.

## Contract

`checkHealth()` reads Orloj health and capability discovery endpoints.

`submitApprovedTask(record)` validates a `heavenzfire.shared-task.v1` record and dispatches it only when:
1. status is `approved`;
2. approval state is `approved`; and
3. an auditable `approval` evidence item with an actor is present.

It creates a Task resource with the configured AgentSystem and carries the stable HeavenzFire task ID in metadata and input. It does not approve Orloj tool calls or TaskApprovals. Orloj's own policies and approvals remain authoritative inside Orloj. A task may begin running after creation if Orloj has an eligible worker and system configured; call this method only after the task-specific human approval transition.

`getTaskStatus(name)` reads the provider Task status. Provider traces/history are not copied into the HeavenzFire evidence ledger by this first adapter slice.

## Safety and limits

- Loopback-only network destination; bounded request timeout and response size.
- No automatic task execution from a proposed/pending record.
- No secret values are returned in capability/status results or error messages.
- The adapter never writes Orloj policy, secrets, agents, tools, or approval decisions.
- A successful unit test against a local HTTP fixture does not prove a live Orloj instance is installed or healthy.

## Test

```sh
node --test UnifiedField/OrlojAdapter/orloj-adapter.test.cjs
```
