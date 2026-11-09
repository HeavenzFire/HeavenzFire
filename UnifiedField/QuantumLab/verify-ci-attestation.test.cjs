'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyCiEvidence, verifyRegistryAttestations } = require('./verify-ci-attestation.cjs');

const repository = 'HeavenzFire/HeavenzFire';
const revision = 'a'.repeat(40);
const artifactDigest = 'sha256:' + 'b'.repeat(64);

function fixture() {
  const run = {
    id: 123,
    run_attempt: 1,
    workflow_id: 456,
    name: 'Unified Field Completeness Registry',
    path: '.github/workflows/unified-field-completeness.yml',
    head_sha: revision,
    status: 'completed',
    conclusion: 'success',
    event: 'pull_request',
    updated_at: '2026-11-09T19:00:00Z',
    repository: { full_name: repository }
  };
  const jobs = {
    jobs: [{
      name: 'completeness',
      status: 'completed',
      conclusion: 'success',
      steps: [
        { name: 'Validate capability registry', status: 'completed', conclusion: 'success' },
        { name: 'Test registry enforcement', status: 'completed', conclusion: 'success' }
      ]
    }]
  };
  const artifacts = {
    artifacts: [{
      name: 'uf-completeness-tests',
      digest: artifactDigest,
      expired: false,
      size_in_bytes: 2048
    }]
  };
  const evidence = {
    testCommand: 'node --test UnifiedField/QuantumLab/uf-completeness-registry.test.cjs',
    testResult: 'pass',
    revision,
    verifiedAt: run.updated_at,
    repository,
    workflowRunId: 123,
    workflowRunAttempt: 1,
    workflowId: 456,
    workflowName: run.name,
    workflowPath: run.path,
    workflowJob: 'completeness',
    requiredSteps: ['Validate capability registry', 'Test registry enforcement'],
    artifactName: 'uf-completeness-tests',
    artifactDigest
  };
  const fetchImpl = async url => {
    if (url.endsWith('/actions/runs/123')) return new Response(JSON.stringify(run), { status: 200 });
    if (url.includes('/actions/runs/123/jobs?')) return new Response(JSON.stringify(jobs), { status: 200 });
    if (url.includes('/actions/runs/123/artifacts?')) return new Response(JSON.stringify(artifacts), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  return { run, jobs, artifacts, evidence, fetchImpl };
}

test('verifies exact successful GitHub run, required job steps, and artifact digest', async () => {
  const f = fixture();
  const result = await verifyCiEvidence(f.evidence, { repository, token: 'x'.repeat(40), fetchImpl: f.fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.runId, 123);
  assert.equal(result.revision, revision);
  assert.equal(result.artifactDigest, artifactDigest);
});

test('rejects a workflow run for a different commit', async () => {
  const f = fixture();
  f.run.head_sha = 'c'.repeat(40);
  await assert.rejects(
    verifyCiEvidence(f.evidence, { repository, token: 'x'.repeat(40), fetchImpl: f.fetchImpl }),
    /workflow_run_binding_mismatch/
  );
});

test('rejects missing or failed required job steps', async () => {
  const f = fixture();
  f.jobs.jobs[0].steps[1].conclusion = 'failure';
  await assert.rejects(
    verifyCiEvidence(f.evidence, { repository, token: 'x'.repeat(40), fetchImpl: f.fetchImpl }),
    /required_step_not_successful/
  );
});

test('rejects an artifact with a different digest or expired state', async () => {
  const f = fixture();
  f.artifacts.artifacts[0].digest = 'sha256:' + 'c'.repeat(64);
  await assert.rejects(
    verifyCiEvidence(f.evidence, { repository, token: 'x'.repeat(40), fetchImpl: f.fetchImpl }),
    /artifact_missing_expired_or_digest_mismatch/
  );
});

test('rejects a run from another repository and a missing GitHub token', async () => {
  const f = fixture();
  await assert.rejects(
    verifyCiEvidence(f.evidence, { repository: 'other/repo', token: 'x'.repeat(40), fetchImpl: f.fetchImpl }),
    /repository_mismatch/
  );
  await assert.rejects(
    verifyCiEvidence(f.evidence, { repository, token: '', fetchImpl: f.fetchImpl }),
    /github_token_required/
  );
});

test('does not require network credentials while no capability claims verified', async () => {
  const result = await verifyRegistryAttestations({
    schemaVersion: 1,
    capabilities: [{
      id: 'example.capability', name: 'Example', layer: 'control-plane',
      status: 'partial', owner: 'UnifiedField', implementation: 'example.cjs',
      substrates: ['node'], triggers: ['manual'], integrations: ['task'],
      permissions: ['read-only'], evidence: {}, acceptance: ['test']
    }]
  });
  assert.equal(result.ok, true);
  assert.equal(result.verified.length, 0);
});
