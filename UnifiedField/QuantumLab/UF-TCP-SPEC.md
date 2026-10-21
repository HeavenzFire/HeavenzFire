# Unified Field Ternary Consensus Protocol (UF-TCP) — v0.1

Status: proposed specification; not yet implemented or security-audited.

## Purpose

Prevent a single model, reviewer, orchestrator, or majority vote from converting an unsupported claim into an accepted result. Use deterministic rules to combine independent evidence, explicit abstention, reproducible tests, and auditable records.

## 1. Ternary claim state

Every claim and task result MUST use exactly one decision state:

- **+1 ACCEPT**: all mandatory evidence and safety gates pass.
- **0 ABSTAIN / UNKNOWN**: evidence is missing, reviewers disagree, checks are inconclusive, or independence cannot be established.
- **-1 REJECT**: a reproducible counterexample exists, a required test fails, or a safety invariant is violated.

A timeout, missing reviewer, invalid signature, malformed evidence, or untrusted source MUST NOT be interpreted as +1. No automatic conversion from 0 to +1 is permitted.

## 2. Separate proposer from verifiers

For a normal-risk code change, require three logically separate roles:
1. **Proposer**: produces a patch and a claim/evidence manifest.
2. **Independent verifier A**: checks the diff, stated invariants, and test results without relying on the proposer's conclusion.
3. **Independent verifier B**: attempts to falsify the claim, checks edge cases and reproduces tests.

A coordinator only applies the deterministic policy; it does not overrule failed mandatory gates. Role labels are not evidence that separate models or independent processes actually ran. Record model/process identity and execution boundaries when available. If independence cannot be demonstrated, report it as a limitation.

## 3. Deterministic decision function

For each claim, record mandatory gates as pass, fail, or unknown. Apply this policy in order:

1. If any mandatory safety invariant fails, decision = -1.
2. Else if any required test fails or a reproducible counterexample invalidates the claim, decision = -1.
3. Else if any required evidence or verifier result is missing, invalid, stale, or unrepeatable, decision = 0.
4. Else if all mandatory gates pass and both independent verifiers accept with evidence references, decision = +1.
5. Otherwise decision = 0.

No majority vote can override a mandatory failure or missing gate. Optional advisory opinions may inform a follow-up but cannot change the deterministic result. Record the policy version and input-manifest hash with every decision.

## 4. Evidence contract

Each verifier must reference:
- immutable commit SHA and exact file paths/line ranges or diff hash;
- exact commands and environment/version information for tests;
- exit codes and captured outputs or durable CI run links;
- expected result versus observed result;
- test coverage of stated safety invariants;
- known limitations, assumptions, and unresolved counterexamples;
- UTC timestamp and verifier identity/process provenance.

Do not accept prose such as “looks good” as verification. Evidence must be independently inspectable. Redact credentials and personal data; never place secrets in logs or manifests.

## 5. Challenge and reconciliation

Verifiers work from the same immutable candidate revision but produce separate reports. They must not copy one another's conclusion before completing their checks. A disagreement sets state to 0 and creates a challenge record containing the disputed claim, evidence on each side, and the next discriminating test. After a patch, repeat verification against the new commit SHA; never carry forward approval from an older revision.

## 6. Safety gates and authority

- Read-only inspection and isolated tests may proceed autonomously.
- Small reversible edits may proceed on a working branch when backups and diffs are preserved.
- Merge, production deployment, deletion, credential changes, privileged execution, firewall changes, network exposure, and irreversible actions require explicit human approval.
- A verifier cannot approve its own patch alone; the proposer cannot self-certify.
- If the audit log is unavailable or integrity checks fail, stop mutation and return 0.
- Prefer least privilege, loopback-only defaults, and fail-closed behavior.

## 7. Minimal record format

A decision record should include:

```json
{
  "protocol": "UF-TCP/0.1",
  "claim_id": "stable-id",
  "candidate_commit": "full-git-sha",
  "decision": 0,
  "mandatory_gates": [
    {"id": "unit-tests", "state": 0, "evidence": []},
    {"id": "security-invariants", "state": 0, "evidence": []}
  ],
  "verifiers": [
    {"role": "verifier-a", "identity": "recorded-process-id", "decision": 0, "evidence": []},
    {"role": "verifier-b", "identity": "recorded-process-id", "decision": 0, "evidence": []}
  ],
  "policy_version": "UF-TCP/0.1",
  "manifest_sha256": "sha256-of-canonical-input-manifest",
  "unresolved": ["replace placeholders with actual unresolved questions"]
}
```

The sample is a schema illustration, not a successful verification record. Canonical serialization, hashing, signature format, key custody, and replay protection must be specified before treating records as tamper-evident.

## 8. Acceptance tests

1. **Unknown is not success**: remove one required verifier result; expected decision is 0.
2. **No majority override**: make three advisory votes positive but one mandatory safety gate fail; expected decision is -1.
3. **Revision binding**: change one byte in the candidate commit; approval for the old SHA must not validate the new revision.
4. **Disagreement stays unresolved**: verifiers produce conflicting evidence and no discriminating test has run; expected decision is 0.
5. **Deterministic replay**: identical canonical inputs and policy version produce byte-identical decision output.
6. **Fail closed on audit failure**: simulate unavailable or corrupted decision log; mutation is blocked.

## 9. Current limitations

This document defines a proposed policy only. It does not implement consensus, launch agents, prove verifier independence, provide cryptographic signatures, or certify the existing Unified Field runtime. Implementation should begin with a pure deterministic policy function and unit tests, then integrate with the existing task ledger and dashboard. No merge or privileged action is implied by this proposal.
