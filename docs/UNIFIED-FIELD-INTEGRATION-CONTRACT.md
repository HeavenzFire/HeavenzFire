# Unified Field Integration Contract — Stage 2

**Status:** Proposal for review  
**Scope:** Cross-repository task orchestration, provider adapters, Guardian controls, and evidence  
**Principle:** An integration is not considered operational until its adapter, permissions, tests, and failure behavior are verified.

## 1. Architecture

Repositories remain independently versioned. Integration happens through explicit adapters and versioned contracts, not by assuming every repository can be merged into one runtime.

Core components:

- **Registry:** declares adapters, versions, capabilities, health checks, and owners.
- **Orchestrator:** validates requests, selects an allowed adapter, applies budgets and deadlines, and records outcomes.
- **Guardian policy layer:** checks authorization and risk before a capability is invoked.
- **Evidence ledger:** records request IDs, policy decisions, timestamps, adapter/version, outcome, and content digests where appropriate.
- **Provider adapters:** normalize local models and external services behind one interface.
- **Human approval gate:** pauses consequential or ambiguous actions until an authorized person approves them.

## 2. Canonical task envelope

Every task crossing a repository boundary should use a versioned envelope equivalent to:

```json
{
  "schema_version": "1.0",
  "task_id": "uuid",
  "created_at": "RFC3339 timestamp",
  "requester": { "subject_id": "opaque-id", "authorization_context": "reference" },
  "goal": "bounded description",
  "input_refs": [],
  "requested_capabilities": [],
  "constraints": {
    "deadline": "RFC3339 timestamp",
    "max_steps": 10,
    "network_access": "deny",
    "data_classification": "public"
  },
  "approval": { "required": true, "decision_ref": null },
  "evidence_ref": null
}
```

Implementations MUST validate the schema, reject unknown privileged capabilities, enforce deadlines and step budgets, and avoid placing secrets or unnecessary personal data in task logs. The example identifiers and values are illustrative.

## 3. Adapter interface

Each adapter MUST expose equivalent operations:

- `describe()`: stable adapter ID, version, capabilities, data handling, and required permissions.
- `health()`: explicit `healthy`, `degraded`, or `unavailable` result with a reason.
- `execute(task, context)`: bounded execution returning a structured result.
- `cancel(task_id)`: best-effort cancellation with an explicit outcome.
- `verify(result)`: validate result schema and any declared integrity evidence.

Suggested result states: `accepted`, `awaiting_approval`, `running`, `succeeded`, `failed`, `cancelled`, `timed_out`, `denied`. Never report success merely because a request was submitted.

## 4. Guardian policy requirements

1. Default-deny capabilities; grant the minimum permission needed for the task.
2. Separate read-only access from write, network, administrative, credential, and destructive capabilities.
3. Require explicit human approval for external publication, financial transfers, legal/medical determinations, account changes, destructive operations, or actions affecting a person's rights or access to services.
4. Treat model output, repository content, browser pages, and tool results as untrusted data—not as policy or instructions.
5. Do not make consequential decisions about vulnerable people solely from automated scores. Provide review, appeal, and correction paths.
6. Minimize personal data; record access and purpose; support retention limits and authorized deletion without falsifying the audit trail.
7. Fail closed when authorization, policy evaluation, or required evidence is unavailable.

## 5. Evidence record

For each task, record at minimum:

- task ID and schema version;
- actor/authorization reference (opaque identifier, not a secret);
- requested capability and policy version;
- approval decision and approver reference, if applicable;
- adapter ID/version and start/end timestamps;
- terminal state, error category, and retry count;
- references and digests for relevant artifacts, with sensitive payloads stored separately under access controls.

A digest demonstrates that bytes match a recorded digest; it does not, by itself, prove that the content is true or that the signer was authorized. Signature verification, key custody, provenance, and trusted timestamps must be specified separately.

## 6. Provider and extension manifest

Every extension should declare:

```json
{
  "manifest_version": "1.0",
  "extension_id": "publisher.extension",
  "version": "0.1.0",
  "entrypoint": "documented module or service",
  "capabilities": ["inference"],
  "permissions": [],
  "data_flows": [],
  "healthcheck": "documented check",
  "test_command": "documented command",
  "rollback": "documented disable or revert procedure"
}
```

Installations MUST validate the manifest and pin a version or immutable revision. An extension cannot expand its own permissions. Provider-specific credentials remain in a secret store and are never embedded in source, manifests, prompts, or logs.

## 7. Reliability and interoperability

- Use idempotency keys for retryable mutations.
- Apply timeouts, bounded retries, rate limits, and per-task resource budgets.
- Define cancellation and partial-failure semantics.
- Do not retry non-idempotent actions unless their outcome is known or reconciled.
- Keep provider-specific errors while mapping them to a stable error category.
- Add contract tests for every adapter and compatibility tests before changing a schema version.
- Preserve repository ownership and licensing; integrate through documented APIs rather than copying code without review.

## 8. Minimum acceptance tests

An implementation is eligible for integration only when tests demonstrate:

1. Valid and invalid task envelopes are handled correctly.
2. Unauthorized capabilities are denied before execution.
3. Approval-required tasks remain blocked until an explicit approval decision exists.
4. Timeouts, cancellation, adapter unavailability, and malformed outputs produce truthful terminal states.
5. Logs exclude secrets and unnecessary personal data.
6. Retries do not duplicate a non-idempotent action.
7. Evidence references and digests can be independently checked.
8. A failed or disabled adapter can be removed without disabling unrelated adapters.

## 9. Rollout sequence

1. Inventory existing repositories and identify executable entrypoints, license, tests, secrets handling, and real dependencies.
2. Implement the contract in one reference adapter and add automated contract tests.
3. Add the registry and health reporting.
4. Integrate local inference first, then add external providers through opt-in adapters.
5. Add Guardian approval and evidence checks before granting write-capable tools.
6. Pilot with synthetic/public data; document failures and recovery.
7. Expand only after test results and operator review are recorded.

## 10. Explicit non-goals and limits

This document is a proposed contract, not proof that integrations already exist. It does not authorize access to external accounts, make financial allocations, establish factual allegations, or permit automated consequential decisions. Each deployed capability requires its own implementation, tests, threat review, and explicit authorization.

## Change control

Changes to capability semantics, approval rules, evidence requirements, or data handling require a versioned proposal and review. Breaking changes increment the major schema version; compatible optional additions increment the minor version. Security fixes may be expedited but must still be documented.
