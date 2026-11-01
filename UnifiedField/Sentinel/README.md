# HeavenzFire Sentinel

HeavenzFire Sentinel is the defensive-security workstream inside Unified Field. It is implemented as a set of auditable modules and adapters, not as a separate hosted dashboard or an unrestricted scanning agent.

## Current delivery status

This first slice defines the security boundary and the 16 specialist roles. It does not yet perform network scans, prove authorization to any external asset, or connect the Sentinel roles to a live model runtime.

- Scope validation: implemented in `scope-policy.cjs`.
- Sixteen specialist role definitions: `sentinel-agent-manifest.json`.
- Deterministic policy tests: `scope-policy.test.cjs`.
- Live scanner adapters, durable Sentinel task persistence, dashboard/API, and real 16-role execution: pending.

## Architecture

1. **Authorization boundary:** every scan proposal must carry an explicit, unexpired authorization scope. The scope names exact hosts; wildcard targets are rejected.
2. **Policy enforcement:** the scanner adapter must call `validateScanRequest` before any network operation. A prompt or agent recommendation is never authorization.
3. **Safe defaults:** only explicitly enabled check types are accepted. No exploit execution, credential testing, brute force, persistence, stealth, lateral movement, or destructive tests.
4. **Worker model:** the manifest defines sixteen logical specialist roles. It does not imply sixteen independent model processes. Runtime concurrency is a separate measured property.
5. **Evidence:** each finding must preserve the target, check identifier, observation time, sanitized evidence, source/provenance, confidence, and verification status. A model-generated claim remains a proposal until independently verified.
6. **Integration:** reuse the Unified Field shared-task contract, local orchestrator, and evidence ledger through narrow adapters. Do not create a second canonical task ledger.

## Initial safe check identifiers

- `dns_records`: DNS posture observations for exact authorized names.
- `tls_certificate`: certificate chain, validity, and protocol posture.
- `http_security_headers`: response security-header presence and values.
- `http_metadata`: bounded status, redirect, and server metadata; do not collect page contents by default.

These identifiers are policy declarations only. A check is not operational until its adapter, timeout/redirect behavior, evidence format, and positive/negative tests exist.

## Test

From repository root with Node.js 18+:

```powershell
node --check .\UnifiedField\Sentinel\scope-policy.cjs
node --test .\UnifiedField\Sentinel\scope-policy.test.cjs
```

## Security and limitations

- This module validates scope records; it does not independently authenticate the authorizing person or verify legal ownership.
- The caller must obtain approval through a trusted control plane and retain the approval evidence.
- DNS resolution and HTTP redirects can change destinations. A future network adapter must re-check every resolved address and redirect hop against policy to prevent scope escape and SSRF.
- Never expose local runtime endpoints directly to the public internet.
- Do not store API keys, credentials, private scan output, or personal data in this repository.
