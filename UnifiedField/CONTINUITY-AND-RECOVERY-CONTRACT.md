# Unified Field Continuity and Recovery Contract v1

**Status:** Proposed; contract specification only.  
**Branch:** `feat/continuity-recovery-contract-v1`  
**Scope:** Recovery planning, export verification, and staged restore across independently versioned Unified Field components.

## 1. Purpose

Define a fail-closed recovery boundary that complements `heavenzfire.shared-task.v1`, the governed task lifecycle, and the append-oriented evidence ledger. Recovery is a proposed capability, not permission to mutate a live workspace.

This contract does not claim that every repository has a compatible snapshot format or that end-to-end restore has already been validated.

## 2. Non-negotiable behavior

1. **Plan first.** `recovery.plan` and `recovery.verify` are read-only. A plan must not write, delete, upload, execute, or overwrite project files.
2. **Restore is a separate action.** A restore requires a distinct task ID, explicit approval evidence, a destination path, and a reviewed plan digest. Approval to plan or verify does not authorize restore.
3. **Fail closed.** Missing metadata, unsupported schema versions, unknown source identity, hash mismatch, path traversal, symlinks/reparse points, ambiguous destination state, or incomplete inventory blocks restore.
4. **No implicit cloud transfer.** Upload, download, remote synchronization, and cross-device restore are separate capabilities requiring their own provider configuration and approval. No credentials are stored in manifests or task metadata.
5. **No destructive default.** Never delete source material. Never overwrite an existing destination. Restore to a new staging directory by default; promotion into a live workspace is a separate, explicitly approved operation.
6. **Evidence is bounded.** Record artifact IDs, relative paths, byte lengths, digests, schema/tool versions, timestamps, and outcomes. Do not place raw secrets, environment dumps, authentication tokens, or unnecessary personal data in the ledger.
7. **Truthful status.** A manifest digest proves consistency with that manifest, not authorship, source truth, safe contents, or successful application-level recovery.

## 3. Contract shapes

### Recovery plan

A plan should include:

- `schemaVersion`: exact supported contract version.
- `planId`: stable unique identifier.
- `createdAt`: ISO-8601 timestamp with timezone.
- `source`: repository/component identifier and immutable revision where available.
- `destination`: normalized absolute staging path; no wildcard destinations.
- `entries[]`: normalized relative path, entry type, byte length, SHA-256, and inclusion/exclusion reason.
- `exclusions[]`: explicit categories such as caches, build output, transient logs, and secret-bearing files.
- `totals`: file count and byte count derived from entries.
- `planDigest`: SHA-256 of the canonicalized plan payload excluding this field.

Canonicalization must be deterministic and documented before signatures or cross-implementation equality are claimed. A digest alone is not a signature.

### Verification result

A verification result should include `planId`, `planDigest`, `checkedAt`, `status`, counts of checked/missing/changed/unexpected entries, and stable error codes. It must not silently repair the input or convert an error into success.

Allowed statuses:

- `verified`: every required entry matches and no blocking condition was found.
- `blocked`: a safety or policy precondition failed.
- `mismatch`: content, path, length, or digest differs.
- `incomplete`: the verifier could not inspect all required entries.
- `error`: an unexpected operational failure occurred.

Only `verified` may proceed to a separately approved staging restore; it does not authorize promotion to a live destination.

### Restore result

A restore record should link the source plan, plan digest, verification result, explicit approval record, destination, and outcome. Use `planned`, `staging`, `completed`, `blocked`, or `failed`. Never report `completed` until post-write verification of the staged destination succeeds.

## 4. Required state transitions

```text
DISCOVER -> PLAN_CREATED -> PLAN_VERIFIED
                         |               |
                         |               +-- mismatch/blocked/incomplete -> STOP
                         |
                         +-- plan-only result -> STOP

PLAN_VERIFIED -> RESTORE_PROPOSED -> EXPLICIT_APPROVAL -> STAGING_RESTORE
                                                       -> POST_WRITE_VERIFY
                                                       -> COMPLETED or FAILED
```

A caller-supplied actor label is descriptive metadata, not authentication. The governed lifecycle must be the enforcement boundary; callers must not bypass it by invoking a lower-level restore function directly.

## 5. Path and filesystem rules

- Resolve and normalize the destination before any write.
- Reject absolute paths inside manifest entries, drive-letter paths, UNC paths, parent traversal (`..`), NUL bytes, and paths that escape the staging root after normalization.
- Reject symlinks and Windows reparse points unless a future version defines safe handling explicitly.
- Detect duplicate normalized paths and case-folding collisions before restore.
- Use exclusive creation for staged files; do not follow links created after validation.
- Enforce per-file and total-byte limits before copying.
- Write into a newly created staging directory. If it already exists or changes unexpectedly, stop.
- Recompute size and SHA-256 after writing; any mismatch makes the restore `failed`.
- Keep the source immutable and preserve failure evidence without dumping file contents.

## 6. Retry and outage semantics

- A retry must reuse the same `planId` only for the identical canonical plan and digest.
- Duplicate delivery of the same task ID and payload is idempotent; the same task ID with a different payload is a conflict and must be rejected.
- Network loss during plan/verify returns `incomplete` or `error`; it must not be interpreted as an empty snapshot.
- Network loss during staging leaves the operation non-completed. A retry must inspect the staging directory and either resume under a documented idempotent rule or stop with a conflict; never blindly overwrite.
- A service restart must replay the durable task/evidence journal and reconcile the last recorded state with the filesystem before continuing.
- If the evidence journal cannot be written or validated, stop before the next state transition.

## 7. Integration boundaries

- **Shared task contract:** carry task identity, proposed/pending state, approval evidence, and outcome references; do not put raw snapshot contents into task metadata.
- **Capability registry:** expose plan, verify, and restore as distinct capabilities with separate permissions and health/freshness status.
- **Evidence ledger:** append plan digest, verification summary, approval reference, and final result; record artifact hashes rather than secret-bearing contents.
- **Spirit_Engine / recovery fabric:** treat as an adapter candidate only after code, license, and end-to-end restore behavior are independently verified.
- **Guardian / funding workflows:** recovery tooling must not autonomously decide legal, financial, eligibility, or other consequential outcomes.

## 8. Acceptance test matrix

A reference adapter is not ready until deterministic tests cover:

1. Stable plan serialization produces the same digest for the same logical entries.
2. Tampered bytes, changed lengths, missing files, unexpected files, and duplicate paths block completion.
3. Parent traversal, absolute/UNC paths, symlinks/reparse points, and case-collision paths are rejected.
4. Secret-pattern files are excluded or blocked according to policy; secrets never appear in manifest metadata or logs.
5. Plan and verify are read-only, including on failure.
6. Restore without explicit approval is rejected; plan approval cannot be reused as restore approval.
7. Existing destinations are never overwritten and source files remain unchanged.
8. A staged write is re-hashed and verified before `completed`.
9. Simulated interruption before write, mid-write, and after write but before journal commit yields a non-success status and safe retry/conflict behavior.
10. Duplicate task delivery is idempotent; changed payload under the same task ID is rejected.
11. Journal corruption, sequence gaps, hash-chain mismatch, and journal-write failure stop the lifecycle.
12. CI runs the focused suite without network access or live credentials.

## 9. Exit criteria

This specification is accepted only when an implementation PR provides a reference adapter, deterministic tests for the matrix above, and CI evidence. A separate operator review must verify Windows PowerShell 5.1 compatibility where applicable. Cloud transfer, live promotion, and production readiness remain out of scope until independently reviewed.

## 10. Honest limitations

This document is a proposed contract. It is not a security audit, does not prove a particular backup is complete, and does not establish that restore works end to end. Hashes detect changes relative to recorded values; they do not establish provenance unless a trusted signature and key-custody process is added.
