# Unified Field Worker Forge

## Purpose

The Worker Forge defines versioned worker blueprints, constructs deterministic multidimensional adversarial evaluation plans, compares two runs for reproducibility, and blocks promotion until qualification and independent review pass. It does not fine-tune model weights, execute generated worker code, or grant a candidate new privileges.

## Architecture

- **Forge:** validates a typed blueprint, allowlisted capabilities, explicit forbidden capabilities, and proposal-only execution mode.
- **Evaluation tensor:** Cartesian product of six explicit axes: task type, risk class, evidence quality, tool scope, adversarial profile, and failure mode. Every cell has a stable case ID and deterministic seed derived from its coordinates. Full coverage is generated or an oversized plan is rejected; the planner never silently truncates.
- **Adversarial suite:** prompt injection, malformed input, unauthorized tool request, stale evidence, contradictory evidence, output-schema violation, budget exhaustion, timeout recovery, duplicate replay, and dependency cycles.
- **Determinism gate:** runs must cover the exact same case IDs and agree on outcome, output hash, pass state, and critical state.
- **Qualification gate:** at least 95% pass rate, complete matrix coverage, no critical adversarial failure, all required profiles represented, and identical replay.
- **Promotion gate:** additionally requires an explicitly identified independent reviewer. No self-promotion.
- **Auditability:** canonical blueprint hash, matrix hash, case IDs, fixed seeds, and qualification hash support reproducible review.

## Dashboard integration

The loopback dashboard exposes `GET /api/forge/plan` to produce the fixed 720-cell default evaluation tensor and `POST /api/forge/validate` to validate a candidate blueprint. The dashboard editor is a working JSON input; validation returns capability/schema errors and a content hash. These endpoints do not execute the candidate or the evaluation plan. The UI labels the matrix as planned, not executed.

## Use

```js
const { createBlueprint, buildEvaluationMatrix, evaluateQualification, promotionDecision } = require('./worker-forge.cjs');
const validated = createBlueprint(workerBlueprint);
if (!validated.ok) throw new Error(validated.errors.join(', '));
const plan = buildEvaluationMatrix(validated.blueprint.axes, { maxCases: 2048 });
// Supply firstRun and secondRun from a separately controlled evaluator.
// Never treat a model's self-reported test results as evidence.
const qualification = evaluateQualification(plan, firstRun, secondRun);
const promotion = promotionDecision(qualification, independentReview);
```

## Current boundary

This is a qualification framework and deterministic evaluation-plan generator, not a claim that model weights have been trained. Training/fine-tuning is a separate pipeline requiring curated datasets, licensing/provenance checks, compute, held-out evaluations, and versioned checkpoints. Candidate output stays untrusted; execution remains outside the Forge and must be separately sandboxed and approved. Passing the qualification gate is evidence against the specified suite, not a guarantee of general competence.
