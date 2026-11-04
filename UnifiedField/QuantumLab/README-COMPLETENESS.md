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
node .\uf-completeness-registry.cjs
node --test .\uf-completeness-registry.test.cjs
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
