# Unified Field Resilient Routing Model v1

## Goal
Plan deterministic routes between worker nodes and report whether the supplied graph has two internally node-disjoint and link-disjoint paths. A gyroid is a candidate topology generator, not proof of connectivity or fault tolerance.

## Graph and planner
The graph is directed. Nodes have unique IDs and optional availability; links have unique IDs, endpoints, and optional availability. A caller supplies a failure snapshot. The planner excludes unavailable or failed components, enumerates simple paths in deterministic order, and selects the shortest path plus a node/link-disjoint backup when one exists. Limits: 32 nodes, 128 links, 20,000 search states. Search exhaustion returns HOLD.

## Outcomes
- RESILIENT: two disjoint paths exist in the supplied snapshot.
- DEGRADED: one path exists, but no disjoint backup was established.
- HOLD: no route can be justified, an endpoint is unavailable, or the bounded search limit is reached.

## Safety and limitations
Planning is not automatic failover. The model does not detect failures, verify live link health, authenticate peers, replicate task state, or execute tasks. Node/link disjointness does not prove independence from shared power, hosts, credentials, control planes, or other shared-risk groups. A future dispatcher must verify freshness, peer identity, authorization, task idempotency, and policy approval before acting. During a partition, prefer HOLD to unsafe dispatch.

## Verification matrix
Test: deterministic results under input reordering; disjoint primary/backup routes; avoiding failed links and nodes; single corridor reports DEGRADED; no surviving path returns HOLD; unavailable/unknown endpoints return HOLD; malformed/duplicate graph IDs are rejected; live health, shared-risk independence, automatic failover, and execution are explicitly not claimed.

## References
IETF RFC 8355 discusses path-protection and disjoint routes: https://datatracker.ietf.org/doc/rfc8355/ . NetworkX documents node-disjoint paths: https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.connectivity.disjoint_paths.node_disjoint_paths.html . These references inform the model; they do not verify this implementation.
