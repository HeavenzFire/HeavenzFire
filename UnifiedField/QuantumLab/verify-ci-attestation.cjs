'use strict';

const path = require('node:path');
const { readRegistry, validateRegistry } = require('./uf-completeness-registry.cjs');

const API = 'https://api.github.com';
const ALLOWED_EVENTS = new Set(['pull_request', 'push', 'workflow_dispatch']);

async function githubGet(repository, route, token, fetchImpl) {
  const response = await fetchImpl(API + '/repos/' + repository + route, {
    method: 'GET',
    redirect: 'error',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: 'Bearer ' + token,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'HeavenzFire-UF-CI-Attestation'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('github_api_http_' + response.status);
  return response.json();
}

function validateEvidenceShape(evidence, repository) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('ci_attestation_evidence_invalid');
  if (evidence.repository !== repository) throw new Error('ci_attestation_repository_mismatch');
  if (!Number.isSafeInteger(evidence.workflowRunId) || evidence.workflowRunId < 1) throw new Error('ci_attestation_run_id_invalid');
  if (!Number.isSafeInteger(evidence.workflowRunAttempt) || evidence.workflowRunAttempt < 1) throw new Error('ci_attestation_run_attempt_invalid');
  if (!Number.isSafeInteger(evidence.workflowId) || evidence.workflowId < 1) throw new Error('ci_attestation_workflow_id_invalid');
  if (typeof evidence.workflowName !== 'string' || !evidence.workflowName.trim()) throw new Error('ci_attestation_workflow_name_invalid');
  if (typeof evidence.workflowPath !== 'string' || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(evidence.workflowPath)) throw new Error('ci_attestation_workflow_path_invalid');
  if (typeof evidence.workflowJob !== 'string' || !evidence.workflowJob.trim()) throw new Error('ci_attestation_job_invalid');
  if (!Array.isArray(evidence.requiredSteps) || evidence.requiredSteps.length === 0 ||
      evidence.requiredSteps.some(step => typeof step !== 'string' || !step.trim())) throw new Error('ci_attestation_required_steps_invalid');
  if (typeof evidence.artifactName !== 'string' || !evidence.artifactName.trim()) throw new Error('ci_attestation_artifact_name_invalid');
  if (typeof evidence.artifactDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(evidence.artifactDigest)) throw new Error('ci_attestation_artifact_digest_invalid');
  if (typeof evidence.revision !== 'string' || !/^[a-f0-9]{40}$/i.test(evidence.revision)) throw new Error('ci_attestation_revision_invalid');
  if (evidence.testResult !== 'pass' || typeof evidence.testCommand !== 'string' || !evidence.testCommand.trim()) throw new Error('ci_attestation_test_claim_invalid');
  if (typeof evidence.verifiedAt !== 'string' || !Number.isFinite(Date.parse(evidence.verifiedAt))) throw new Error('ci_attestation_timestamp_invalid');
}

async function verifyCiEvidence(evidence, { repository, token, fetchImpl = fetch } = {}) {
  if (typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('ci_attestation_repository_required');
  validateEvidenceShape(evidence, repository);
  if (typeof token !== 'string' || token.length < 20) throw new Error('ci_attestation_github_token_required');

  const run = await githubGet(repository, '/actions/runs/' + evidence.workflowRunId, token, fetchImpl);
  if (run.id !== evidence.workflowRunId ||
      run.run_attempt !== evidence.workflowRunAttempt ||
      run.workflow_id !== evidence.workflowId ||
      run.name !== evidence.workflowName ||
      run.path !== evidence.workflowPath ||
      run.head_sha !== evidence.revision ||
      !run.repository || run.repository.full_name !== repository) {
    throw new Error('ci_attestation_workflow_run_binding_mismatch');
  }
  if (run.status !== 'completed' || run.conclusion !== 'success' || !ALLOWED_EVENTS.has(run.event)) {
    throw new Error('ci_attestation_workflow_run_not_successful');
  }
  if (!Number.isFinite(Date.parse(run.updated_at)) ||
      Date.parse(run.updated_at) !== Date.parse(evidence.verifiedAt)) {
    throw new Error('ci_attestation_completion_time_mismatch');
  }

  const jobs = await githubGet(repository, '/actions/runs/' + evidence.workflowRunId + '/jobs?per_page=100&filter=latest', token, fetchImpl);
  const job = Array.isArray(jobs.jobs) && jobs.jobs.find(item =>
    item.name === evidence.workflowJob && item.status === 'completed' && item.conclusion === 'success');
  if (!job) throw new Error('ci_attestation_required_job_not_successful');
  const successfulSteps = new Set((Array.isArray(job.steps) ? job.steps : [])
    .filter(step => step.status === 'completed' && step.conclusion === 'success')
    .map(step => step.name));
  if (evidence.requiredSteps.some(step => !successfulSteps.has(step))) {
    throw new Error('ci_attestation_required_step_not_successful');
  }

  const artifacts = await githubGet(repository, '/actions/runs/' + evidence.workflowRunId + '/artifacts?per_page=100', token, fetchImpl);
  const artifact = Array.isArray(artifacts.artifacts) && artifacts.artifacts.find(item =>
    item.name === evidence.artifactName && item.digest === evidence.artifactDigest &&
    item.expired !== true && Number.isFinite(item.size_in_bytes) && item.size_in_bytes > 0);
  if (!artifact) throw new Error('ci_attestation_artifact_missing_expired_or_digest_mismatch');

  return Object.freeze({
    ok: true,
    runId: run.id,
    runAttempt: run.run_attempt,
    revision: run.head_sha,
    workflow: run.name,
    job: job.name,
    artifact: artifact.name,
    artifactDigest: artifact.digest,
    verifiedAt: run.updated_at
  });
}

async function verifyRegistryAttestations(registry, options = {}) {
  const structural = validateRegistry(registry);
  if (!structural.ok) throw new Error('registry_invalid:' + structural.errors.join(','));
  const verified = registry.capabilities.filter(item => item.status === 'verified');
  if (verified.length === 0) return { ok: true, verified: [], message: 'No capabilities are marked verified; no remote attestation claims to check.' };
  const results = [];
  for (const item of verified) {
    const result = await verifyCiEvidence(item.evidence, options);
    results.push({ capabilityId: item.id, ...result });
  }
  return { ok: true, verified: results };
}

async function main(argv = process.argv.slice(2), io = console) {
  const filePath = argv.find(arg => !arg.startsWith('--')) ||
    path.join(__dirname, 'unified-field-completeness.json');
  let loaded;
  try {
    loaded = readRegistry(filePath);
    const result = await verifyRegistryAttestations(loaded.registry, {
      repository: process.env.GITHUB_REPOSITORY || process.env.HF_GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN
    });
    io.log(JSON.stringify({ file: loaded.absolute, ...result }, null, 2));
    return 0;
  } catch (error) {
    io.error(JSON.stringify({ ok: false, error: String(error.message || error) }));
    return 1;
  }
}

if (require.main === module) main().then(code => { process.exitCode = code; });

module.exports = { verifyCiEvidence, verifyRegistryAttestations, validateEvidenceShape, main };
