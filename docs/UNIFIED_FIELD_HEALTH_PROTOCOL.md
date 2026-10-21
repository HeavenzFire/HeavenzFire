# Unified Field Health Protocol v1

This protocol provides a small, executable liveness check for configured HTTP health endpoints. It is intentionally separate from capability metadata and authorization.

## Run

Requires Python 3.10+ and no third-party packages.

```powershell
python -m unittest tests.test_health_probe -v
python tools/health_probe.py examples/nodes.json --timeout 2
```

The example addresses are illustrative local endpoints; a node reports `ALIVE` only when the probe receives HTTP success. If the sample services are not running, `DARK` is the correct result.

## Result contract

- `ALIVE`: the configured endpoint returned a 2xx HTTP response during this probe.
- `DARK`: invalid registry, non-success HTTP response, timeout, or connection failure.
- `reason`: short human-readable diagnostic; never silently convert a failed probe into success.
- `latency_ms`: measured request duration.
- `overall`: `ALIVE` only when the registry is non-empty and every configured node responds successfully.

This is a liveness check, not identity verification, code integrity attestation, readiness proof, or permission grant. Do not expose health endpoints publicly without appropriate network controls. Registry URLs should be trusted operator configuration; deployments that accept untrusted registries must add network allowlists and SSRF protections.

## Network egress controls

- Loopback health endpoints are allowed by default.
- Non-loopback hosts must be listed explicitly in the optional top-level `allowed_hosts` array, using exact hostnames or IP addresses.
- Wildcards are rejected; entries such as `*.example.com` are not supported.
- HTTP redirects are not followed, preventing a trusted endpoint from redirecting the probe to an unapproved host.
- A node registry is still configuration, not authorization. Keep it under trusted operator control and review allowed hosts before adding remote nodes.

Example for an explicitly permitted remote endpoint:

```json
{
  "schema_version": "1.0",
  "allowed_hosts": ["health.example.com"],
  "nodes": [
    {
      "id": "remote-node",
      "health_url": "https://health.example.com/health"
    }
  ]
}
```

The allowlist compares the configured hostname; it is not a substitute for network-layer egress controls or protection against DNS rebinding. For high-risk deployments, enforce outbound firewall rules as well.

## Integration boundary

1. Validate capability metadata.
2. Probe node endpoints and record observed health with a timestamp at the caller.
3. Verify repository/commit provenance separately.
4. Enforce authorization at the execution boundary; never trust registry permissions alone.
5. Surface failed nodes with their explicit reasons so operators can recover instead of masking failures.
