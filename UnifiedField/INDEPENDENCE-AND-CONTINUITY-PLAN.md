# Unified Field: Free-Tier Resilience and Continuity Plan

Status: proposal committed to the Unified Field draft branch; not yet merged or deployed.

## Mission

Build a portable, auditable, local-first federation that can continue useful work when a hosted AI provider, GitHub feature, network connection, or free quota becomes unavailable. “Enterprise-grade” is a set of measurable engineering controls—not a claim that a free account has enterprise service guarantees.

The design must remain within provider terms, user authorization, applicable law, and explicit approval boundaries. Resilience means reducing single points of failure, preserving user-owned work, and providing safe degraded modes; it does not mean bypassing another service's access controls, quotas, or security policies.

## Architecture

1. **Source of truth — Git repositories and portable artifacts**
   - Keep source, schemas, tests, migration notes, and deployment instructions in version control.
   - Export periodic signed or hashed source snapshots and release manifests to a second user-controlled location.
   - Do not treat GitHub as the only copy. Verify restoration from snapshots rather than merely checking that an archive exists.
   - Never commit API keys, tokens, private user data, or live credentials.

2. **Local control plane**
   - Keep task contracts, task inbox, approval decisions, evidence records, and audit events usable on the user's Windows machine.
   - Make local operation the default when hosted services are unavailable.
   - Keep bind addresses loopback-only by default; remote access requires explicit authentication, scoped authorization, and documented network boundaries.

3. **Provider adapters**
   - Place GitHub, model providers, browser extensions, and future data sources behind small replaceable adapters.
   - Use a capability registry with states such as available, degraded, quota_exhausted, unauthorized, and disabled; record observed evidence and timestamps.
   - Fail closed for privileged actions when authorization, provider status, or required evidence is uncertain.
   - Never silently substitute a provider in a way that changes data handling or approval requirements.

4. **Task lifecycle and human authority**
   - Every external or consequential action starts as a proposal.
   - Approval is scoped to the specific task, target, and requested capabilities.
   - A running task must emit bounded progress and evidence; failures become reviewable records.
   - No autonomous merging, credential changes, destructive cleanup, financial actions, or public accusations without separate explicit authorization.

5. **Evidence and provenance**
   - Store source identity, retrieval time, artifact hashes, transformation history, and verification outcome.
   - A hash chain can reveal some changes; it does not by itself prove who created a record, that the source was truthful, or that an attacker could not rewrite the whole ledger.
   - Use corroboration and human review before consequential conclusions.

## Free-tier operating model

- Treat quotas, rate limits, build minutes, API availability, and product policies as variable external dependencies.
- Prefer lightweight tests, caching of permitted non-sensitive results, incremental CI, and local test runs before remote runs.
- Use a provider-neutral local test suite as the minimum acceptance gate.
- Separate optional integrations from the core so quota exhaustion does not block local task inspection, export, or recovery.
- Never create multiple accounts or rotate identities to evade free-tier limits. If a limit is reached, pause, queue work, run locally where permitted, or obtain authorized capacity.
- Avoid claiming uptime, disaster-recovery guarantees, or enterprise certification without measured evidence and a service agreement that supports those claims.

## Continuity and recovery

1. On startup, run a read-only health check: disk headroom, repository revision, required runtime versions, inbox readability, and available model/provider adapters.
2. If a dependency fails, mark it degraded and continue only with tasks that do not require it.
3. Queue non-urgent proposals locally; do not mark them approved or executed while offline.
4. Export task and evidence data in documented, versioned formats.
5. Restore into a clean temporary directory and verify hashes, schemas, and tests before replacing active state.
6. Record recovery duration, missing records, and manual steps. A backup is not considered verified until a restore test passes.

## Security baseline

- Least privilege for GitHub tokens and local processes.
- No secrets in browser bundles, logs, test fixtures, screenshots, or committed .env files.
- Loopback binding by default; authentication and explicit origin validation for any exposed service.
- Dependency versions and build outputs recorded for reproducibility.
- CI runs syntax checks, unit tests, contract tests, secret scanning where available, and dependency review where practical.
- Privileged/destructive operations require explicit approval and a recoverable backup where feasible.

## Measurable acceptance gates

The project must not claim resilient operation until evidence demonstrates:

- [ ] Core contract, inbox, browser bridge, and evidence tests pass locally and in CI.
- [ ] A complete local task can be proposed, approved, executed through an explicitly authorized adapter, and completed with evidence.
- [ ] Provider outage or quota exhaustion produces a clear degraded state without losing queued work.
- [ ] Export and clean-directory restore preserve task and evidence records.
- [ ] A tampered record is detected by verification tests.
- [ ] A secret scan and permission review pass before release.
- [ ] A human can disable any adapter and inspect or export all pending work without that provider.

## Current status and limits

This document is an architecture plan, not evidence that every gate is satisfied. The current Unified Field work is split across draft pull requests and prototype adapters. Full multi-repository end-to-end operation, clean-room disaster recovery, production security review, and independent audit remain unverified. Keep related pull requests in draft until their tests and integration evidence are reviewed.

## Next implementation sequence

1. Add a versioned capability/status contract and tests.
2. Add an export/restore command for task and evidence data, with integrity verification.
3. Add outage/quota simulation tests and prove the core remains usable offline.
4. Add a reproducible release manifest and recovery drill.
5. Publish a status report separating verified controls, partial implementations, and open risks.
