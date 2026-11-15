# HeavenzFire Evidence Distribution Backbone

Status: integration contract and SHA3-256 manifest primitive. This document does not claim a live public-records crawler, agency request dispatcher, external ledger anchoring, or multi-agent publication pipeline is deployed.

## Existing components to reuse

- `FieldCore/public-record-adapter.cjs`: validates retrieved HTTPS records against an explicit host allowlist and appends source-attributed events.
- `FieldCore/evidence-ledger.cjs`: local append-oriented SHA-256 hash chain; single-writer, tamper-evident (not tamper-proof).
- `FieldCore/anchor-manifest.cjs`: creates and verifies SHA3-256 domain-separated Merkle manifests over separately retained artifacts.
- `LocalOrchestrator`: existing bounded 16-role analysis path. A role label is not proof of independent execution; retain execution identity and evidence references.
- `PeerLink`: existing authenticated worker transport. It requires a reachable HTTPS hub for non-loopback peers and does not provide hosting, DNS, certificates, or NAT traversal.
- `UF-TCP`: deterministic ACCEPT / ABSTAIN / REJECT policy. Missing or unverifiable evidence must remain ABSTAIN.

## Evidence lifecycle

1. Retrieve a public record using a source-specific, documented client. Record the request, retrieval timestamp, HTTP outcome, and source locator.
2. Preserve the exact response bytes as a separate artifact. Do not silently normalize or overwrite the original.
3. Calculate SHA-256 over the exact artifact bytes. Run the public-record adapter with an explicit HTTPS host allowlist; append a compact summary and artifact digest to the local evidence ledger.
4. Build an anchor manifest from artifact IDs, SHA-256 digests, and source URLs. Verify the manifest locally before export.
5. Store the manifest and ledger head in an independently controlled location (for example, a signed GitHub release or an externally timestamped archive) only after human review. A local hash or public commit alone does not prove source truth, legal acquisition, authorship, or admissibility.
6. Submit the same immutable evidence references to independent review roles. Each reviewer records its own execution identity, reviewed manifest digest, commands, outputs, and limitations.
7. Apply UF-TCP. Missing, stale, contradictory, or non-reproducible evidence yields ABSTAIN. A verified counterexample or mandatory invariant failure yields REJECT.
8. Publish only approved, source-linked summaries. Keep personal, confidential, sealed, medical, and otherwise restricted data out of public artifacts unless disclosure is lawful and necessary.

## Public-record request controls

- Use the correct statute and jurisdiction: Texas Public Information Act requests go to the relevant Texas governmental body; federal FOIA requests go to the relevant federal agency.
- Scope each request to identifiable records, date ranges, custodians, systems, and fields. Avoid duplicative bulk requests and do not characterize filing volume as proof of wrongdoing.
- Track submission time, acknowledgment, clarification, cost estimate, statutory notices, production, withholding basis, appeal/referral, and closure as separate events.
- A request deadline is not a guarantee that every record will be produced by a fixed date. Exceptions, clarification, cost, and Attorney General review can affect the process. Seek qualified legal review for disputes and sensitive records.
- Do not infer fraud, misconduct, intent, or clinical conclusions from billing variance or administrative differences without corroboration and domain review.

## Verification

From the repository root:

```powershell
node --check .\UnifiedField\FieldCore\anchor-manifest.cjs
node --test .\UnifiedField\FieldCore\anchor-manifest.test.cjs
node --test .\UnifiedField\FieldCore\public-record-adapter.test.cjs
node --test .\UnifiedField\FieldCore\evidence-ledger.test.cjs
```

The anchor-manifest tests are local and dependency-free. They verify deterministic construction, tamper detection, input validation, and odd-leaf Merkle handling. They do not verify an external timestamp authority, blockchain anchoring, legal admissibility, or source authenticity.

## Deployment boundary

Default operation is local-first. No automatic FOIA/TPIA submissions, public posting, mass email, third-party outreach, cloud uploads, or ledger transactions are performed by this module. Those are separate actions requiring scoped approval and a documented target.
