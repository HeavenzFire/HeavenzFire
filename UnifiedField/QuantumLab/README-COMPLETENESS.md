# Unified Field Completeness Registry

This registry is the machine-readable integration gap register for the Unified Field. It records each capability's layer, implementation, substrate, trigger, integration boundary, permission model, evidence, and acceptance tests.

It is deliberately conservative:
- `planned` means no implementation is asserted.
- `partial` means some components exist but the end-to-end path is incomplete.
- `implemented_unverified` means source exists but reproducible integration evidence is missing.
- `blocked` means a documented dependency or policy prevents progress.
- `verified` requires a passing test command, immutable revision, and verification timestamp.

A configured endpoint is not a live service. A passing unit test is not an end-to-end integration test. A role registry is not a running agent pool.

## Run

From this directory:

```powershell
node .\\uf-completeness-registry.cjs
node --test .\\uf-completeness-registry.test.cjs
```

Use `--strict` in release qualification to return exit code 3 while any capability is not verified. Normal CI validates registry structure without treating known open integration work as a CI failure.

## Updating the register

When implementation changes:
1. Update the affected capability status and exact implementation paths.
2. Add a deterministic test and exact command.
3. Record the immutable commit SHA and UTC verification timestamp only after the test actually passes.
4. Mark `verified` only for the tested scope; keep broader host or cross-repository claims partial until those paths pass.
5. Keep credentials, raw environment values, personal data, and bearer tokens out of this file.

## Current integration frontier

The first register covers host inventory, service discovery, task contracts, persistence, approval enforcement, capability registry, event triggers, dispatch, adapter framework, model runtimes, agent consensus, evidence, observability, recovery, security posture, browser integration, and CI quality gates.

This register is a control mechanism for closing gaps, not a claim that all listed capabilities are complete.

## GitHub Actions attestation

A registry entry may be marked `verified` only when its evidence binds the claim to a completed GitHub Actions run and an immutable test artifact. In addition to the test command, passing result, full commit SHA, and UTC completion time, record:

- `repository`, `workflowRunId`, and `workflowRunAttempt`;
- `workflowId`, `workflowName`, and exact `workflowPath`;
- successful `workflowJob` and the exact successful `requiredSteps`;
- `artifactName` and the GitHub artifact's SHA-256 `artifactDigest`.

The structural registry validator checks that these fields are present and well-formed. The separate `verify-ci-attestation.cjs` verifier queries GitHub's Actions API and checks that the run belongs to this repository, tested the exact recorded commit, used the recorded workflow and attempt, completed successfully, passed every required job step, and retained the named artifact with the recorded digest.

The workflow separates trust domains:
- Pull-request and manual-dispatch runs validate the registry and tests with `contents: read` only. They do not receive Actions API permission.
- The remote attestation job runs only after a push to `main`, uses the trusted main revision, and receives the narrowly scoped `actions: read` permission.
- No pull-request-controlled code runs in the job that holds the Actions API token.

The validation job uploads the TAP test report as `uf-completeness-tests` and publishes the run URL, tested revision, attempt, workflow ref, and artifact digest in the Actions job summary. After a run completes, use its Actions API metadata and artifact digest to populate evidence fields. Do not copy a run ID or digest from a different commit or attempt.

Run the remote attestation check locally with a read-only GitHub token:

```powershell
$env:GITHUB_REPOSITORY = 'HeavenzFire/HeavenzFire'
$env:GITHUB_TOKEN = 'your-read-only-token'
node .\\verify-ci-attestation.cjs
```

The verifier does not promote capabilities automatically. Host deployment, cross-device behavior, Windows ACLs, and live inference remain separate acceptance gates.
