# Unified Field Ternary Policy Engine

**Status:** reviewable deterministic policy module; not yet wired into task dispatch or the dashboard.

## Contract

evaluatePolicy(input) is a pure CommonJS function. It does not execute tasks, call providers, access the clock, or perform network I/O.

- +1 / allow: action is allowlisted, evidence is verified and references at least one evidence ID, and required approval matches both the action and task ID.
- 0 / abstain: evidence is not_run, incomplete, malformed, or reference-free; required approval is absent or pending.
- -1 / deny: invalid top-level input or policy, action not allowlisted, explicit policy deny, failed evidence, rejected approval, or approval scope mismatch.
- Explicit deny takes precedence over allowlisting.
- Output reasons are deduplicated and sorted to keep results deterministic.
- A decision is a policy result, not proof that an action executed or that evidence is authentic. Callers must independently validate evidence provenance and enforce the decision at the execution boundary.

## Verification

Run from the repository root:

    node --check UnifiedField/FieldCore/ternary-policy-engine.cjs
    node --test UnifiedField/FieldCore/ternary-policy-engine.test.cjs

The GitHub Actions workflow repeats these checks on relevant pull requests and default-branch pushes. This PR does not integrate dispatch, persist decisions, or mark agents/seats as live.
