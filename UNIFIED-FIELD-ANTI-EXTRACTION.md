# HeavenzFire Unified Field: Anti-Extraction Foundation

**Status:** Initial working specification  
**Scope:** Local-first, user-controlled software that reduces coercive extraction of human attention, personal data, and economic value.  
**Principle:** Protect people by giving them usable controls, verifiable evidence, and meaningful exit rights—not by replacing one centralized authority with another.

## Mission

Build an interoperable set of small, auditable components that help people understand and control how software captures attention, collects data, locks in users, and monetizes personal activity. The Unified Field is an integration project across repositories; it is not a claim that separate AI chat instances are automatically collaborating or that all repositories already interoperate.

## Non-negotiable design constraints

1. **Local-first:** core features should work without sending personal data to a remote service.
2. **Consent and revocation:** collect the minimum data needed; make consent specific, visible, and revocable.
3. **No covert surveillance:** no hidden tracking, undisclosed profiling, or silent data export.
4. **Portable exit:** users can export their data in documented formats and delete local copies with clear confirmation.
5. **Human control:** consequential actions require understandable previews and explicit authorization.
6. **Verifiable claims:** report what tests prove, what remains untested, and known limitations.
7. **No attention dark patterns:** no deceptive urgency, infinite-scroll optimization, manipulative notifications, or forced engagement loops in components we build.
8. **Accessibility:** keyboard navigation, semantic markup, reduced-motion support, and plain-language explanations are acceptance criteria.
9. **Interoperability before duplication:** inventory existing repositories and reuse working interfaces before creating another service.
10. **Safety and accountability:** audit logs must avoid storing secrets; privileged actions require separate authorization.

## Initial architecture

- **Capability Registry:** machine-readable list of components, API contracts, permissions, owners, maturity, and verification status.
- **Consent & Policy Gate:** deny-by-default authorization checks for data export, external network calls, and privileged actions.
- **Local Event Ledger:** append-only, privacy-minimized record of consent changes and consequential actions; no raw secrets or unnecessary behavioral telemetry.
- **Portable Data Export:** documented JSON export with schema version, integrity hash, and explicit preview/confirmation.
- **Attention Controls:** user-configurable focus sessions, notification budgets, quiet periods, and transparent per-site controls. No remote monitoring.
- **Integration Adapters:** narrow adapters for existing HeavenzFire projects, with explicit input/output schemas and failure behavior.
- **Verification Harness:** unit tests, schema validation, threat-model checks, and reproducible integration tests.

## Capability Registry contract (v1)

Each component entry must contain:

- `id`: stable lowercase identifier
- `version`: semantic version
- `status`: one of `proposed`, `implemented`, `verified`, `deprecated`
- `data_classes`: declared categories of data handled
- `network_access`: `none`, `allowlisted`, or `unrestricted` (unrestricted requires explicit security review)
- `permissions`: explicit capabilities required
- `entrypoints`: documented callable interfaces
- `tests`: test command and last observed result
- `owner`: accountable maintainer or team
- `limitations`: known gaps and non-goals

A component cannot be marked `verified` without a reproducible test command and recorded passing result. Static files and health endpoints alone do not establish end-to-end correctness.

## Threat model

Protect against: unnecessary collection, accidental data disclosure, dark-pattern interaction design, unreviewed network egress, permission creep, silent destructive actions, tampered exports, and misleading claims of verification.

Out of scope for the initial milestone: defeating a compromised operating system, guaranteeing anonymity against a global observer, replacing legal/regulatory remedies, or automatically redistributing money. Any financial transfer, public accusation, account change, or destructive operation remains subject to explicit human review and appropriate legal/security controls.

## Milestones and acceptance criteria

### M0 — Inventory and baseline
- Map candidate repositories to concrete components and dependencies.
- Identify existing code versus generated/static shells.
- Record baseline commands and observed outcomes.
- Do not claim integration until a real end-to-end path is exercised.

### M1 — Registry and validator
- Add a JSON Schema for the registry contract.
- Add a small validator with clear non-zero failure exits.
- Test missing required fields, invalid status values, duplicate IDs, and malformed JSON.
- CI must run the validator on every change.

### M2 — Consent and export boundary
- Implement deny-by-default policy checks for outbound data and exports.
- Require explicit confirmation before export.
- Test denial, grant, revocation, and malformed-policy cases.
- Ensure secrets and unnecessary personal data are excluded from logs.

### M3 — User-facing attention controls
- Implement local notification/focus preferences with accessible controls.
- Store preferences locally by default.
- Test persistence, reset, keyboard operation, and reduced-motion behavior.

### M4 — Integration and independent review
- Connect one real existing component through a documented adapter.
- Add integration tests and a rollback procedure.
- Have a separate reviewer attempt to falsify the claimed behavior.
- Publish limitations and test evidence with each release.

## Release gate

A release is blocked by any unresolved high-severity issue involving unauthorized data export, authentication bypass, destructive behavior without confirmation, or false claims about verification. A green unit-test suite is necessary but not sufficient.

## Parallel-work protocol for collaborators

Separate workers should take non-overlapping tasks and report evidence, not just intent:

- **Architect:** repository inventory, interface contracts, dependency graph.
- **Builder:** registry schema and validator with tests.
- **Adversarial verifier:** attack cases, negative tests, and review of permission boundaries.
- **Integrator:** reconcile findings, run the full test matrix, document exact commits and rollback.

Independent ChatGPT conversations do not share state or coordinate automatically. Collaborators must exchange repository names, branch names, commit SHAs, file paths, test commands, and observed outputs. Avoid simultaneous edits to the same path.

## First implementation target

Create `schemas/capability-registry.schema.json`, a sample registry, and a validator with tests. Keep the first change isolated on a feature branch. Before adding runtime services, prove the registry contract and failure cases.

## Evidence log

| Claim | Required evidence | Current status |
|---|---|---|
| Repository integration works | End-to-end test across real components | Not yet established by this document |
| Data export is consent-gated | Positive and negative tests for grant/revoke | Not yet implemented here |
| Attention controls are local-first | Network inspection plus persistence tests | Not yet established |
| Components are verified | Reproducible commands and recorded passing output | Per-component evidence required |

This document defines the first coordination contract. It does not claim that the planned components have already been implemented.
