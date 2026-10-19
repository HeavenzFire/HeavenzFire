# HeavenzFire Guardian: Anti-Manipulation Review

This module is a defensive, evidence-first workflow for identifying potentially manipulative interface patterns and recommending protective design changes. It is not an automated legal finding, a clinical diagnosis, or proof of a hidden algorithm.

## Rubric

See [anti-manipulation-rubric.json](./anti-manipulation-rubric.json) for the machine-readable signal taxonomy, evidence contract, risk levels, mitigations, and validation plan.

## Current workflow

For a local text-only prototype, run this from Windows PowerShell after Unified Field and the local workers are running:

```powershell
& "$env:USERPROFILE\\HeavenzFire\\Invoke-HeavenzFireGuardianAudit.ps1" -EvidenceText "You lost three rounds. Deposit now to win it back. Offer expires in 02:00." -SourceReference "synthetic test fixture"
```

The script writes a Guardian report under `%LOCALAPPDATA%\\HeavenzFire\\UnifiedField\\guardian-reports\\` and links the multi-model council report. It deterministically checks whether quoted evidence is an exact substring of the supplied text and whether signal IDs exist in the rubric. Reports remain `pending` for human review.

**Prototype limitation:** a synthetic test produced model-generated quotes that were not present in the supplied evidence and invalid signal IDs. The deterministic validator caught those failures. This is evidence that the current small local models are not yet a reliable classifier; do not use the model's risk label as a decision. The validator itself must also be tested and the model prompt/evaluation set improved before deployment.

1. Provide a screenshot you are authorized to share, or text from a public page that can be reviewed without authentication bypass.
2. Remove names, account identifiers, payment information, and unrelated personal data.
3. Record the exact visible text or region and the source/capture time where appropriate.
4. Run the evidence through the local multi-model council for independent candidate assessments and a skeptical review.
5. Require a human reviewer to confirm or reject each signal before publishing or escalating a claim.
6. Preserve counter-evidence, limitations, and a reproducible test case.

The current Guardian wrapper accepts a short text snippet only; it does not perform OCR on image files or automatically browse sites. Do not describe those features as implemented until a tested adapter is added.

## Defensive boundaries

- Do not place bets, automate wagers, bypass access controls, or disrupt third-party services.
- Do not infer hidden targeting or ranking logic from a single screenshot.
- Do not identify or profile vulnerable people.
- Use responsible disclosure and appropriate platform/regulatory reporting for substantiated concerns.
- Favor user-facing protections: clearer terms, easy exits, opt-in notifications, time-outs, self-exclusion discoverability, and reduced-friction withdrawal paths.

## Acceptance criteria for a future detector

- Evidence trace for every flagged signal.
- Explicit observed/inferred/not-observable labels.
- Human-labeled evaluation set with consent and privacy review.
- Measured precision, recall, false positives, and reviewer agreement.
- Regression tests for each rubric change.
