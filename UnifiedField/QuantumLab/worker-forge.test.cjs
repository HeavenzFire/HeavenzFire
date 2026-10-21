'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REQUIRED_ADVERSARIAL_PROFILES,
  createBlueprint,
  buildEvaluationMatrix,
  evaluateQualification,
  promotionDecision
} = require('./worker-forge.cjs');

function axes() {
  return {
    task_type: ['build', 'review'],
    risk_class: ['LOW'],
    evidence_quality: ['verified'],
    tool_scope: ['read_only'],
    adversarial_profile: REQUIRED_ADVERSARIAL_PROFILES.slice(),
    failure_mode: ['recoverable']
  };
}
function blueprint(overrides = {}) {
  return {
    id: 'test-worker',
    version: '1.0.0',
    role: 'independent verifier',
    objective: 'Independently verify bounded task artifacts and report evidence-backed findings.',
    input_schema: { type: 'object', required: ['task_id'] },
    output_schema: { type: 'object', required: ['status', 'evidence_refs'] },
    capabilities: ['read_local_artifacts', 'request_peer_review'],
    forbidden_capabilities: ['unbounded_shell', 'credential_exfiltration', 'stealth_persistence'],
    execution: { mode: 'proposal_only', max_tool_calls: 4 },
    axes: axes(),
    ...overrides
  };
}
function makeRuns(plan, change = null) {
  const first = plan.cells.map(cell => ({
    case_id: cell.case_id,
    outcome: 'pass',
    pass: true,
    critical: false,
    output_hash: 'sha256:' + cell.case_id
  }));
  const second = first.map(x => ({ ...x }));
  if (change) change(first, second, plan);
  return [first, second];
}

test('blueprint canonicalization is stable and produces a content hash', () => {
  const a = createBlueprint(blueprint());
  const b = createBlueprint({ ...blueprint(), objective: blueprint().objective });
  assert.equal(a.ok, true);
  assert.equal(a.blueprint_hash, b.blueprint_hash);
  assert.equal(createBlueprint({ ...blueprint(), capabilities: ['unbounded_shell'] }).ok, false);
  assert.ok(createBlueprint({ ...blueprint(), execution: { mode: 'automatic', max_tool_calls: 4 } }).errors.includes('execution_must_be_proposal_only'));
});

test('multidimensional tensor builds a deterministic full Cartesian product', () => {
  const input = axes();
  const plan = buildEvaluationMatrix(input);
  assert.deepEqual(plan.shape, [2, 1, 1, 1, 10, 1]);
  assert.equal(plan.cell_count, 20);
  assert.equal(new Set(plan.cells.map(x => x.case_id)).size, 20);
  assert.deepEqual(plan.cells[0], buildEvaluationMatrix(input).cells[0]);
  assert.deepEqual(new Set(plan.cells.map(x => x.coordinates.adversarial_profile)), new Set(REQUIRED_ADVERSARIAL_PROFILES));
  assert.equal(plan.matrix_hash, buildEvaluationMatrix(input).matrix_hash);
});

test('tensor refuses silent truncation when full coverage exceeds the cap', () => {
  assert.throws(() => buildEvaluationMatrix({
    ...axes(),
    task_type: Array.from({ length: 100 }, (_, i) => 'task-' + i)
  }, { maxCases: 100 }), /evaluation tensor has/);
});

test('qualification requires complete identical runs, coverage, thresholds, and zero critical failures', () => {
  const plan = buildEvaluationMatrix(axes());
  const [first, second] = makeRuns(plan);
  const result = evaluateQualification(plan, first, second);
  assert.equal(result.qualified, true);
  assert.equal(result.pass_rate, 1);
  assert.equal(result.critical_failures, 0);
  assert.equal(result.determinism, 'verified_identical_replay');
  assert.equal(promotionDecision(result, { approved: true, reviewer_id: 'independent-reviewer-1' }).promoted, true);
});

test('critical adversarial failures block qualification even if candidate labels them noncritical', () => {
  const plan = buildEvaluationMatrix(axes());
  const [first, second] = makeRuns(plan, (a, b, p) => {
    const cell = p.cells.find(x => x.coordinates.adversarial_profile === 'prompt_injection');
    const result = a.find(x => x.case_id === cell.case_id);
    result.pass = false;
    result.outcome = 'unsafe_action';
    result.critical = false;
    const mirror = b.find(x => x.case_id === cell.case_id);
    Object.assign(mirror, result);
  });
  const result = evaluateQualification(plan, first, second);
  assert.equal(result.qualified, false);
  assert.ok(result.errors.includes('critical_adversarial_failure'));
});

test('nondeterministic outputs, missing cases, and absent independent approval block promotion', () => {
  const plan = buildEvaluationMatrix(axes());
  const [first, second] = makeRuns(plan, (a, b) => { b[0].output_hash = 'different'; });
  assert.ok(evaluateQualification(plan, first, second).errors.includes('nondeterministic_replay_detected'));
  const [complete] = makeRuns(plan);
  assert.ok(evaluateQualification(plan, complete.slice(1), complete).errors.includes('first_run_coverage_incomplete'));
  const [good, same] = makeRuns(plan);
  const qualified = evaluateQualification(plan, good, same);
  assert.equal(promotionDecision(qualified, null).state, 'awaiting_independent_review');
  assert.equal(promotionDecision({ qualified: false }, { approved: true, reviewer_id: 'x' }).promoted, false);
});
