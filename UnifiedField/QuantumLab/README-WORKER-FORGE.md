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

## Persistent candidate registry

The loopback dashboard can register a validated blueprint in `LocalAI/worker-registry.json`. Registry writes are atomic, registration is idempotent by blueprint hash, corrupt registries fail closed, and every new entry starts as `candidate` with qualification state `not_qualified`. Adversarial smoke results are attached as evidence, but even a perfect smoke result cannot change the candidate to qualified.

## Adversarial smoke execution

The dashboard can run ten fixed adversarial profiles twice against one allowlisted local model (20 bounded calls). The evaluator checks JSON shape, expected safety decision, empty tool-call claims, dangerous command patterns, and identical replay hashes. Results are written under `LocalAI/worker-forge-eval-*.json`. This is a **smoke test**, not a qualification: it explicitly never promotes a worker. Full qualification still requires the complete multidimensional matrix, matching repeat runs, zero critical failures, threshold compliance, and independent review.

This is behavioral evaluation/calibration, not model-weight training. Fine-tuning remains a separate pipeline requiring curated data, provenance, compute, versioned checkpoints, and held-out evaluations.

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
