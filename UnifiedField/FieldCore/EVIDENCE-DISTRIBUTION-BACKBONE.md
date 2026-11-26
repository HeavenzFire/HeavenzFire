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

## Privacy release gate — BLOCKED

**The current manifest implementation is not approved for real personal or restricted records, public export, or external sharing.** The SHA3-256/Merkle checks establish integrity of the normalized fields they cover; they do not establish privacy, source authenticity, consent, legal authority, or approval provenance.

This gate reflects source-level limitations in the current PR head:

- `artifactId` accepts arbitrary caller-provided text up to 200 characters. Names, email addresses, phone numbers, patient/family identifiers, and case labels can therefore be copied into an exportable manifest.
- `sourceUrl` rejects non-HTTPS schemes and embedded credentials, but the current normalizer preserves query strings and fragments. Signed URLs, session values, tokens, and person-specific query values can therefore be copied into the manifest.
- `verifyAnchorManifest()` normalizes known fields rather than rejecting every unknown property. Extra approval-like metadata such as `approvedBy` or `reviewStatus` is not authenticated by the manifest digest and must never be treated as verified approval or provenance.
- The existing public-record adapter accepts caller-supplied names, record IDs, titles, summaries, and source URLs. These fields have not yet been shown to have a privacy-minimization or retention policy.
- The evidence ledger documents a single-writer model, but cross-process serialization, retention, and compaction have not been verified.

**Until the release gate is closed:**

1. Use synthetic fixtures only in this module's tests and examples.
2. Do not place real child, patient, family, whistleblower, medical, sealed, or case-specific records or identifiers in manifests, repository files, CI logs, or public artifacts.
3. Do not publish or externally share manifests derived from live records.
4. Keep any artifact-ID mapping and original records in an independently access-controlled local store.
5. Treat every approval/provenance field as untrusted unless a separate, attributable verifier checks a signed attestation against a separately provisioned trust root.

**Required acceptance evidence before this gate can be lifted:**

- Strict, versioned schemas reject unknown top-level and entry fields.
- Artifact IDs follow an enforced opaque identifier contract, with deterministic email-, phone-, and case-label regression tests.
- Source URLs reject query and fragment components by default, or use a narrowly reviewed canonicalization policy with tests for signature, token, and session parameters.
- Public-record metadata has explicit minimization and retention rules with regression coverage.
- Approval and reviewer identity are verified independently of caller-supplied manifest fields.
- Cross-process ledger behavior and retention controls are tested before concurrent or long-lived use is claimed.

This documentation warning is a guardrail only. It does not remediate the source-level privacy findings or make the current manifest safe for real records.

