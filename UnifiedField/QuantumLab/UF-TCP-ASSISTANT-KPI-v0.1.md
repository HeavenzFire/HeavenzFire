# UF-TCP Assistant Integration and KPI Contract v0.2

**Status:** KPI and adapter contract; policy engine v0.2 implemented and CI-verified; runtime adoption and end-to-end provider integration pending  
**Protocol:** UF-TCP/0.2  
**Target:** HeavenzFire Unified Field  
**Canonical policy:** `QuantumLab/uf-tcp-policy.cjs` (merged implementation: [PR #137](https://github.com/HeavenzFire/HeavenzFire/pull/137))  
**Coordination ledger:** [UnifiedCodebase issue #6](https://github.com/HeavenzFire/UnifiedCodebase/issues/6)

## 1. Objective

Make an authorized GPT/OpenAI model endpoint a first-class, auditable reasoning adapter in Unified Field and evaluate its work under deterministic ternary evidence policy.

The assistant is a reasoning participant and proposer/research worker. It is not the policy engine, an independent verifier of its own output, a privileged operator, or a source of implicit approval.

The objective function is **verified useful progress under safety and evidence constraints**, not maximum output volume, positive-vote rate, token consumption, or number of nominal agent roles.

## 2. Integration reality and boundary

The existing `services/heavenzfire-api/server.cjs` already contains:
- an OpenAI Responses API adapter (`callOpenAI`);
- an Ollama local adapter (`callOllama`);
- authenticated local API routes;
- an OpenAI-compatible chat response envelope;
- a bounded 16-role reasoning fan-out.

The existing `Start-HeavenzFire-GPT.ps1` launcher requests an OpenAI API key, stores it using Windows DPAPI for the current user, checks visible GPT-6-family model IDs, and starts a loopback-bound local API service.

This is a connection from the local Field to an authorized hosted OpenAI API endpoint. It is **not** a direct tunnel into a ChatGPT web session, does not transfer this session's hidden model runtime or credentials, does not download model weights, and does not make a ChatGPT subscription equivalent to API billing. The first actual inference request—not a model-list response—is the provider connectivity test.

### Required adapter identity

Every run must identify:
- adapter: `openai-responses` (or the selected actual provider adapter);
- configured provider and exact model ID;
- endpoint class (official provider endpoint or explicitly configured compatible endpoint);
- request/run ID and correlation ID;
- policy version and task contract version;
- whether the call was actually executed or only planned;
- provider request outcome, timeout/error class, and bounded usage metadata when supplied.

Never persist API keys, bearer tokens, DPAPI payloads, or raw secret-bearing environment dumps in task records, issue comments, evidence manifests, or logs.

## 3. Unified Field task lifecycle

Every assistant contribution must be attached to a durable task record using the canonical task contract already selected by the Field. Required minimum metadata:

- stable `task_id` and idempotency key;
- objective, scope, risk class, dependencies, and acceptance criteria;
- source/target repository and immutable candidate commit SHA when code is involved;
- proposer identity and adapter/model execution provenance;
- input-manifest digest and output/artifact digest;
- status: `QUEUED`, `ACTIVE`, `BLOCKED`, `REVIEW`, or `VERIFIED`;
- ternary decision: `+1`, `0`, or `-1`;
- evidence references, test commands/results, unresolved risks, and next action.

A generated recommendation is not a completed task. A provider response is not a test result. A task is not `VERIFIED` merely because the assistant says it is complete.

### Role separation

1. **Assistant / proposer:** investigate, formulate claims, draft implementation, and attach evidence. It may also perform a clearly labeled self-review, which does not count as an independent verifier.
2. **Verifier A:** independently inspect the immutable candidate and evidence.
3. **Verifier B / adversarial reviewer:** attempt falsification, inspect boundary conditions, and reproduce critical tests independently.
4. **UF-TCP policy engine:** deterministically evaluate supplied, validated evidence.
5. **Human authority:** retains approval for merge, deployment, deletion, credentials, privileged execution, and other consequential side effects.

Two role names, two prompts, or two calls to the same shared context do not by themselves prove independence. Record actual process/model/provider identity, isolated inputs, execution boundaries, and evidence. If independence cannot be demonstrated, abstain.

## 4. Ternary decision semantics

Use exactly these states for each claim and each mandatory KPI gate:

| Value | State | Meaning |
|---:|---|---|
| +1 | ACCEPT | All mandatory evidence, verification, and safety gates passed |
| 0 | ABSTAIN | Evidence is absent, stale, inconclusive, disputed, or independence is unproven |
| -1 | REJECT | A mandatory invariant failed or a reproducible counterexample invalidates the claim |

Deterministic aggregation uses precedence, not a majority vote:

1. Any mandatory invariant failure or reproducible counterexample => **-1**.
2. Otherwise, any missing/invalid/stale mandatory evidence or verifier => **0**.
3. Otherwise, all mandatory gates pass and both independent verifiers accept with evidence => **+1**.
4. All other combinations => **0**.

A positive advisory vote cannot override a failed gate. Missing work is `NOT_RUN`, not a positive vote. A new commit SHA invalidates all approvals for the old revision. If the audit record is unavailable or corrupt, mutation is blocked and the decision is 0.

## 5. Assistant KPI model

KPIs are reported as a **vector**, not collapsed into one weighted score. This prevents high throughput or a large number of positive model opinions from hiding one critical failure.

| KPI | Measurement | +1 acceptance condition | 0 abstention condition | -1 rejection condition |
|---|---|---|---|---|
| Evidence traceability | Claims with immutable source/evidence references divided by claims requiring evidence | Every material claim has inspectable evidence or is explicitly marked as an assumption | One or more references are missing or cannot be checked | Evidence is fabricated, misrepresented, or contradicted |
| Revision binding | Reviews and tests tied to the exact candidate SHA | All approvals and test artifacts bind to the current immutable SHA | SHA, artifact, or test provenance is incomplete/stale | Approval is knowingly reused for a different revision |
| Independent verification | Required independent reports with distinct, recorded provenance | Both required verifier reports exist and satisfy independence criteria | One or both missing, correlated, or unverifiable | Independence or evidence is forged |
| Reproducibility | Required tests rerun with exact commands/environment and captured outcomes | All mandatory tests reproduce successfully | Tests are not runnable or evidence is incomplete | A mandatory test fails or a reproducible counterexample exists |
| Falsification handling | Counterexamples and challenges recorded and resolved by discriminating evidence | Challenges are resolved against the current revision with evidence | Disagreement remains unresolved | Known counterevidence is concealed or ignored |
| Abstention integrity | Unknown, unsupported, or inaccessible claims remain explicitly unknown | All uncertain claims correctly remain 0 until verified | Uncertainty classification cannot be established | Unknown or failed evidence is represented as accepted |
| Safety and authority | Mutations checked against scope, approval, least privilege, and audit policy | Every action is within declared capability and approval boundary | Authority or audit evidence is unavailable | Unauthorized or prohibited side effect is attempted or performed |
| Durable delivery | Accepted work produces a linked artifact, commit, test result, or verified research result | Deliverable and evidence are durable and retrievable | Work remains partial or blocked | Completion is claimed without the deliverable/evidence |

### Portfolio-level reporting

For each KPI, publish:
- count of `+1`, `0`, and `-1` outcomes;
- numerator, denominator, and excluded/not-applicable count;
- task IDs and evidence links;
- time window and policy version;
- open counterexamples and stale approvals.

Do not average away a critical failure. The portfolio decision is the worst mandatory state: any mandatory -1 makes the relevant workstream -1; otherwise any required 0 keeps it at 0; +1 is possible only when every mandatory gate is +1.

### Optimization targets

After mandatory gates pass, optimize for:
- verified deliverable value per unit of wall-clock time;
- reduction in repeated work and duplicate implementations;
- test coverage of stated invariants and failure modes;
- lower resource/provider cost for equivalent verified results;
- useful parallelism with bounded concurrency and no shared-file conflicts;
- shorter time from evidence-backed proposal to independently verified integration.

Never reward:
- raw token count, number of messages, or number of nominal agents;
- percentage of claims accepted;
- agreement without independent evidence;
- a green dashboard status without end-to-end verification;
- tasks marked complete without a durable artifact and evidence.

## 6. Assistant execution contract

For each assignment, the assistant must:
1. Read the current coordination ledger and target repository state.
2. Declare the task ID, exact scope, risk class, dependencies, and acceptance criteria before implementation.
3. Inspect the current source and avoid creating duplicate systems.
4. Use the authorized provider adapter only when the configured endpoint and model are actually available.
5. Separate observed facts, assumptions, hypotheses, and proposed changes.
6. Make the smallest reversible change on a scoped branch.
7. Run deterministic tests and record exact outcomes; do not invent local test results from GitHub source inspection.
8. Submit the immutable candidate revision for independent review.
9. Apply UF-TCP to the evidence, not to the persuasiveness of the prose.
10. Update the durable ledger and stop at approval boundaries.

The assistant may autonomously perform read-only inspection, source analysis, documentation, and isolated tests. It must not use generated model text as executable authority. Human approval remains required for merge, deployment, destructive changes, credential operations, privilege elevation, firewall changes, or network exposure.

## 7. Integration sequence and acceptance criteria

### Stage A — existing provider adapter
- Verify the current OpenAI Responses API adapter and launcher source.
- Verify loopback binding, bearer authentication, secret redaction, timeouts, bounded request sizes, and provider error handling.
- Distinguish API-key/model-list success from a successful inference request.
- Confirm the actual API endpoint and model access; never infer that the active ChatGPT session is connected.

### Stage B — task envelope and evidence binding
- Add a versioned assistant-run record to the canonical task contract.
- Bind provider/model/run ID, input digest, output digest, candidate SHA, and policy version.
- Reject missing or malformed provenance rather than silently filling it with assumptions.

### Stage C — UF-TCP evaluation
- [x] Implement the deterministic UF-TCP/0.2 policy evaluator with proposer separation, verifier provenance fields, counterexample handling, and ternary outcomes. Merged in [PR #137](https://github.com/HeavenzFire/HeavenzFire/pull/137); GitHub Actions run [41803287549](https://github.com/HeavenzFire/HeavenzFire/actions/runs/41803287549) passed.
- [ ] Integrate the evaluator at the canonical task verification boundary.
- Add tests for missing verifier, correlated verifier, changed commit, malformed digest, failed safety invariant, stale tests, audit corruption, and disagreement.
- Ensure `VERIFIED` cannot be reached from provider response status alone.

### Stage D — KPI telemetry
- Emit the KPI vector and ternary state for every task.
- Display unexecuted roles as `NOT_RUN` and unverified independence as unknown.
- Record denominators and exclusions to prevent misleading percentages.

### Stage E — end-to-end proof
- Run local provider inference with an explicitly configured credential by the operator.
- Run one bounded task through the local API, canonical ledger, independent verifiers, and UF-TCP policy.
- Verify a successful ACCEPT case, an ABSTAIN case, and a REJECT case.
- Capture immutable test/run evidence and verify that an altered candidate SHA invalidates the prior decision.

No stage is complete because its documentation exists. Report each stage as `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, or `VERIFIED` with evidence.

## 8. Current verified source baseline

Inspected from `HeavenzFire/HeavenzFire` main at the time this contract was prepared:

- `services/heavenzfire-api/server.cjs` — commit `f007936a42888cb674c72617c1cf1fdc3282e366`; contains `callOpenAI` using the Responses API and `callOllama`.
- `services/heavenzfire-api/agent-swarm.cjs` — commit `5ed5177472963518f8048519690c2bf81d7473e2`; defines 16 specialist role prompts and bounded provider dispatch. It is multi-call role fan-out, not proof of 16 independent model instances.
- `services/heavenzfire-api/README.md` — documents the local gateway, DPAPI-based launcher, API billing separation, and limitations.
- `UnifiedField/QuantumLab/UF-TCP-SPEC.md` — updated to UF-TCP/0.2 in PR #137.
- `UnifiedField/QuantumLab/uf-tcp-policy.cjs` and `uf-tcp-policy.test.cjs` — implemented and merged in PR #137; the policy test suite and LocalOrchestrator suite pass in GitHub Actions.
- `UnifiedField/QuantumLab/UF-144-COUNCIL-ARCHITECTURE.md` — commit `1ba862849539aec62fd48f9b4fcc3454e855a6fe`; role architecture and independence caveats.
- `UnifiedField/QuantumLab/README-DASHBOARD.md` — explicitly states the dashboard does not yet execute UF-TCP or dispatch the council.

These are source-inspection findings, not a fresh local test run or end-to-end integration result.

## 9. Immediate next actions

1. Cross-reference this contract with UnifiedCodebase issue #6 and the canonical task contract in UnifiedField/FieldCore.
2. Inspect existing UF-TCP tests and service tests before changing implementation.
3. Implement the smallest adapter from assistant run metadata into the canonical task envelope.
4. Add deterministic integration tests proving that provider success cannot directly produce `VERIFIED`.
5. Submit the code change for independent review; do not merge without explicit approval.

**Current state:** the OpenAI provider adapter and UF-TCP/0.2 policy are implemented as separate components. The KPI contract is defined. The canonical task-envelope adapter, per-task KPI telemetry, cryptographic verifier provenance, end-to-end provider inference, and full runtime enforcement across all services remain unimplemented and unverified.
