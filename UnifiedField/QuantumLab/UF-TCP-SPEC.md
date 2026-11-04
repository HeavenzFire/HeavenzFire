# Unified Field Ternary Consensus Protocol (UF-TCP) — v0.2

Status: implemented as a deterministic policy module with unit tests; runtime adoption remains in progress.

## Purpose

Prevent a single model, reviewer, orchestrator, or majority vote from converting an unsupported claim into an accepted result. Use deterministic rules to combine independent evidence, explicit abstention, reproducible tests, and auditable records.

## 1. Ternary claim state

- **+1 ACCEPT**: all mandatory evidence and safety gates pass.
- **0 ABSTAIN / UNKNOWN**: evidence is missing, reviewers disagree, checks are inconclusive, or independence cannot be established.
- **-1 REJECT**: a mandatory invariant fails, a required gate fails, or a reproducible counterexample invalidates the claim.

Timeouts, missing reviewers, invalid attestations, malformed evidence, and untrusted sources MUST NOT be interpreted as +1. No automatic conversion from 0 to +1 is permitted.

## 2. Separate proposer from verifiers

For normal-risk code changes, require:
1. **Proposer**: produces a patch and a claim/evidence manifest.
2. **Independent verifier A**: checks the diff, invariants, and test evidence.
3. **Independent verifier B**: attempts falsification and independently reproduces critical tests.

A coordinator only applies the deterministic policy; it cannot overrule failed mandatory gates. Role labels are not proof of independent models or processes. Each verifier record must carry distinct non-empty `identity`, `execution_id`, and `isolation_id` fields, as well as a unique verifier `id`. These are structural attestations, not cryptographic proof of process independence. External attestation and audit controls are still required for high-assurance claims.

## 3. Deterministic decision function

Apply in order:
1. Any counterexample marked `reproduced` => **-1 REJECT**.
2. Any failed mandatory invariant => **-1 REJECT**.
3. Any failed required gate => **-1 REJECT**.
4. Missing, malformed, unresolved, stale, or unrepeatable evidence => **0 ABSTAIN**.
5. A verifier rejection without a reproduced counterexample => **0 ABSTAIN** and require a discriminating test.
6. Only when all mandatory gates pass and two structurally distinct verifiers accept the same evidence digest => **+1 ACCEPT**.

No majority vote can override a mandatory failure or missing gate. Optional advisory opinions cannot change the deterministic result. Record policy version and input-manifest hash with every decision.

## 4. Required gates

- `tests_pass`
- `security_review_pass`
- `evidence_complete`
- `reproducible`
- `fresh`

All must be explicitly true. A missing key is unknown, not false and not success.

## 5. Evidence contract

Each verifier must reference:
- immutable commit SHA and exact file paths/diff hash;
- exact commands and environment/version for tests;
- exit codes and captured outputs or durable CI links;
- expected versus observed result;
- security invariants and known limitations;
- UTC timestamp and verifier identity/process provenance.

The policy module validates the evidence digest and structural verifier fields. It does not independently fetch GitHub data, validate signatures, establish process isolation, or prove source truth.

## 6. Challenge and reconciliation

Verifiers inspect the same immutable candidate revision but produce separate reports. They must not copy one another's conclusion before completing checks. Disagreement sets state to 0 and creates a challenge record with the disputed claim, evidence on each side, and next discriminating test. After a patch, repeat verification against the new commit SHA; never reuse approval from an older revision.

## 7. Safety and authority

- Read-only inspection and isolated tests may proceed autonomously.
- Small reversible edits may proceed on a scoped branch with preserved diffs.
- Merge, deployment, deletion, credentials, privileged execution, firewall changes, network exposure, and irreversible actions require explicit human approval.
- The proposer cannot self-certify.
- If the audit log is unavailable or integrity checks fail, stop mutation and return 0.
- Prefer least privilege, loopback-only defaults, and fail-closed behavior.

## 8. Acceptance tests

The test suite covers:
1. all gates and two verifier attestations pass;
2. mandatory invariant failure rejects;
3. unknown or missing invariants abstain;
4. failed gate rejects; missing gate abstains;
5. malformed digest abstains;
6. duplicate verifier identities do not count twice;
7. verifier disagreement abstains;
8. reproduced counterexample rejects;
9. unresolved or malformed counterexample abstains;
10. proposer cannot verify own work;
11. verifier execution and isolation contexts must be distinct;
12. verifier evidence must match the reviewed digest;
13. invalid input abstains;
14. identical inputs produce identical decisions.

## 9. Current adoption boundary

The policy module and tests are deterministic and dependency-free. The GitHub Actions workflow runs the policy and LocalOrchestrator test suites on relevant pushes and pull requests. This does not yet mean every Unified Field service calls UF-TCP before marking tasks verified. That runtime integration requires the canonical task-envelope adapter and independent verifier evidence.
