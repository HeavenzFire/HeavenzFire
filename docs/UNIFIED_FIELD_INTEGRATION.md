# Unified Field Integration Report v1

The integrated status CLI joins two separately validated inputs: capability declarations and configured node health endpoints.

## Run

```powershell
python -m unittest tests.test_validate_capabilities tests.test_health_probe tests.test_unified_field -v
python tools/unified_field.py examples/capability-registry.json examples/nodes.json --timeout 2
```

The example node URLs are local illustrative endpoints. When the referenced services are not running, the expected result is `DARK` with a reason; this is a successful diagnostic outcome, not a test failure in the application itself.

## Capability-to-node binding

A capability may declare `node_id`. The integrated report maps that identifier to the node registry and propagates observed health. Missing or unmatched node IDs become `UNBOUND` and cause the overall status to be `DARK`.

Add a binding to a capability entry like:

```json
{
  "id": "local.model",
  "name": "Local Model Runtime",
  "version": "1.0.0",
  "entrypoint": "agents/local_model.py",
  "interfaces": ["http", "cli"],
  "trust": "local",
  "permissions": ["read", "execute"],
  "node_id": "local-agent"
}
```

## What the report means

- `ALIVE`: all registered nodes passed HTTP liveness probes and all declared capabilities map to a registered node.
- `DARK`: validation failure, unhealthy node, or unbound capability.
- `UNBOUND`: no matching node is registered for that capability.
- `permissions_declared` and `trust_declared` are descriptive metadata, not granted authority.

The CLI only reads JSON and issues health GET requests. It never executes capability entrypoints. Liveness does not prove identity, readiness, artifact integrity, or authorization. A later execution gateway must verify provenance and enforce least privilege independently.


## Windows PowerShell launcher

From the repository root in Windows PowerShell 5.1 or newer:

\`\`\`powershell
.\Enter-UnifiedField.ps1
\`\`\`

Optional registry paths and probe timeout:

\`\`\`powershell
.\Enter-UnifiedField.ps1 -CapabilityRegistry .\examples\capability-registry.json -NodeRegistry .\examples\nodes.json -TimeoutSeconds 3
\`\`\`

The launcher checks that Python and required files exist, invokes the read-only diagnostic CLI, and propagates its exit code. A \`DARK\` result is a diagnostic finding to investigate, not a reason to silently mark a node healthy.
