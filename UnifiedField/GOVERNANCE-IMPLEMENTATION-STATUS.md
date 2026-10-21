# Unified Field Governance Rollout

## Purpose
Track governance as an implemented engineering control, not as a claim that every repository or runtime is already governed.

## Baseline introduced by this change
- `/AGENTS.md`: portable repository-wide contributor/agent contract.
- `.github/workflows/governance-baseline.yml`: pull-request and push checks for required governance clauses, shared-task contract presence, and obvious credential patterns in the governance files.
- This document: rollout status and explicit limitations.

## Existing integration foundations
The current core repository already contains a federated repository registry, a `heavenzfire.shared-task.v1` lifecycle contract, a loopback task inbox, a Manifest V3 BrowserBridge prototype, and evidence-oriented architecture documentation. These are separate capabilities with distinct verification states; their presence does not mean all 276 discovered repositories are reviewed or integrated.

Existing evidence in the repository registry reports:
- BrowserBridge unit tests passed 4/4, but real-browser installation smoke testing remained pending.
- Selected cross-component contract and inbox checks have been run, but persistent inbox deployment and a complete live inference cycle were not established by that record.
- Repository discovery is not equivalent to source review, license/provenance review, security review, or end-to-end verification.

## Status semantics
- **Implemented in this branch:** files above exist on the governance feature branch.
- **CI pending:** GitHub Actions must run on the resulting commit; no pass is claimed until its result is inspected.
- **Not enforced yet:** repository rulesets/branch protection, required-check selection, CODEOWNERS review requirements, and organization-wide policy have not been changed by this document.
- **Not globally rolled out:** no automatic edits have been made to the other repositories.
- **Runtime not implied:** this governance PR does not start local services, install a browser extension, or execute agent proposals.

## Rollout sequence
1. Merge the baseline only after reviewing the PR diff and observing the CI result.
2. Configure repository rulesets so the governance check is required for protected branches; verify effective settings after saving.
3. Add a minimal `AGENTS.md` override only where a repository needs a documented runtime, test, or safety-specific rule.
4. Classify repositories by provenance, license, role, interface, security boundary, and reproducible tests before integration.
5. Integrate adapters incrementally through the shared task/evidence contracts. Keep proposals pending until explicitly approved.
6. Verify the full local path on the authorized Windows host: launch, health discovery, task proposal, approval, bounded execution, evidence recording, and clean shutdown. Record real command output and exit codes.

## Acceptance criteria
- Governance workflow passes on the PR head.
- Reviewers can trace every claimed result to a workflow run, command output, commit, or artifact.
- Pending work is visible as pending rather than represented as healthy.
- No branch protection, merge, deployment, or local-machine operation is claimed unless independently verified.
