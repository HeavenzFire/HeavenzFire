# UF-144 Council Architecture — v0.1

Status: design proposal. This file does not claim that 144 independent agents are running.

## Intent

HeavenzFire's 144-seat council is organized as two 72-seat councils:
- 72 Shem HaMephorash seats: constructive/proposal-side roles.
- 72 Goetic kings seats: counter-examination/challenge-side roles.

These names preserve the project's intended symbolic framework. Their computational roles are explicit software assignments, not claims that spiritual beings are instantiated, conscious, or independently communicating.

## Council contract

Every work item receives a stable task ID and immutable candidate commit or artifact hash. Each seat receives a bounded assignment, a defined evidence requirement, and a timeout. Every response must be structured as +1 (accept with evidence), 0 (abstain/insufficient evidence), or -1 (reject with a reproducible counterexample or failed invariant).

A role name, generated answer, or vote is not evidence by itself. The runtime must record whether each seat was actually executed, what tool/model/process ran, its input manifest hash, output, and evidence references. Unexecuted seats are NOT_RUN, never silently counted as votes.

## Suggested pairing

Pair each constructive seat with a challenge seat for review of the same claim:
- Proposal seat i: formulate one testable claim and supply evidence.
- Counter-examiner seat i: independently try to falsify it, verify sources and test results, and record counterexamples.
- Independent deterministic policy engine: apply UF-TCP/0.1 to the resulting evidence.
- Integrator: produce a human-readable result without changing the policy result.

Pairing is an assignment scheme, not proof of independence. To reduce correlated error, vary review methods and evidence sources; prevent the challenger from merely paraphrasing the proposal; use deterministic tests and direct inspection where possible.

## Deterministic decision rules

1. A failed mandatory safety invariant or reproducible counterexample means -1.
2. Missing required execution, evidence, valid test result, or independent review means 0.
3. +1 requires all mandatory gates to pass and required independent reviews to accept with inspectable evidence.
4. A vote count cannot override any mandatory failure or unknown.
5. Disagreement defaults to 0 until a discriminating test resolves it.
6. A new candidate revision invalidates prior approval; rerun checks against the new SHA.
7. Audit-log failure blocks mutation and returns 0.

## Staged implementation

1. Stage A — deterministic core: pure ternary policy function, canonical input manifest, unit tests and replay test.
2. Stage B — role registry: 144 named seats, assignment constraints, explicit NOT_RUN state, and separate execution provenance.
3. Stage C — cross-examination queue: each claim receives a proposal report and counter-report; disagreements create a test request.
4. Stage D — dashboard: show all 144 seats as NOT_CONFIGURED, QUEUED, RUNNING, ACCEPT, ABSTAIN, REJECT, or ERROR; distinguish simulated role assignments from actual model/process executions.
5. Stage E — resilient worker: local-first, least privilege, bounded retries, durable queue, idempotent task IDs, crash recovery, signed or otherwise integrity-protected audit records.

Do not label the council consensus achieved if a required seat did not run or the independence requirement is unverified. The dashboard must display coverage and missing reviewers.

## Acceptance tests

- A single positive seat cannot accept a claim.
- 71 missing counter-reports cannot be treated as successful consensus.
- A failed security invariant rejects the candidate regardless of vote totals.
- Missing evidence or reviewer disagreement yields 0.
- Replaying the same canonical manifest and policy version yields the same result.
- Re-review after a commit change is required.
- Simulated seats are visually and programmatically distinguishable from actual executions.
- If one worker crashes, its seat is ERROR or NOT_RUN, not positive.

## Safety boundary

Read-only inspection, documentation, and isolated tests can be automated. Merge, deployment, destructive operations, credential changes, privileged execution, firewall changes, and exposure beyond loopback require explicit human approval.
