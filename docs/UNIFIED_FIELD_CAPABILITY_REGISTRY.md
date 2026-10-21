# Unified Field — Capability Registry v1

This is the first executable integration contract for the Unified Field. It gives independent nodes and extensions a common, machine-checkable description instead of assuming that a repository or agent is operational.

## Validate locally

Requires Python 3.10+; no third-party dependencies.

```powershell
python -m unittest tests.test_validate_capabilities -v
python tools/validate_capabilities.py examples/capability-registry.json
```

Expected sample output: `VALID capability registry: 1 capability(ies)`.

## Contract

Each registry uses `schema_version: "1.0"` and a `capabilities` array. Each capability must provide:

- `id`: unique lowercase stable identifier
- `name`: non-empty display name
- `version`: semantic version `MAJOR.MINOR.PATCH` (optional prerelease suffix)
- `entrypoint`: relative path; parent-directory traversal is rejected
- `interfaces`: one or more non-empty interface labels
- `trust`: `unverified`, `local`, or `verified`
- `permissions`: zero or more of `read`, `write`, `network`, `execute`, `admin`

The validator checks metadata and obvious unsafe path traversal; it does **not** prove code safety, authenticate a node, or grant permissions. Treat registry contents as declarations, never as authorization. Runtime authorization must independently enforce least privilege and human approval for sensitive actions.

## Integration sequence

1. Each repo publishes a registry entry for its actual runnable capabilities.
2. CI runs the validator and fails closed on invalid metadata.
3. A discovery service aggregates entries but preserves repository and commit provenance.
4. A separate runtime policy layer verifies artifacts and enforces permissions before execution.
5. Health checks report `ALIVE` only after an actual probe succeeds; otherwise return `DARK` with a reason.

This is an initial, testable contract—not a claim that all ecosystem repositories are already integrated.
