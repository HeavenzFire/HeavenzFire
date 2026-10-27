# Unified Field — Cloud-First Build

The canonical build is maintained in GitHub and verified by GitHub Actions. The operator's Windows machine is not required to clone the entire repository ecosystem or hold all source trees at once.

## Current executable surface

From a checkout of this repository:

```sh
node unified-field/uf.mjs validate
node unified-field/uf.mjs status
node unified-field/uf.mjs list
node unified-field/uf.mjs graph
node --test unified-field/core/registry.test.mjs
```

The workflow `.github/workflows/unified-field-cloud-core.yml` runs registry validation, local source-path integrity checks, module listing, and contract tests on GitHub-hosted runners for changes touching the Unified Field core. `status` checks committed source paths only; it does not claim that local services or remote integrations are online.

## How the ecosystem is unified

- `modules.json` is the registry for core components and repository adapters.
- Every adapter names its canonical source repository; source code is not copied merely because a repository exists.
- Modules are disabled until source review, license/provenance checks, contract tests, and security checks are complete.
- A shared registry and contract suite are the first integration layer. Modules will be brought in by dependency or narrow adapter rather than concatenating unrelated applications.
- The local Continuous R&D runner remains an operator-local capability. Its local services and reports are not represented as cloud-connected by this workflow.

## Status semantics

- `implemented-runner`: a runner exists in the canonical repository; this label does not prove that every local runtime dependency is committed here.
- `candidate`: repository identified for integration; not yet imported or verified.
- `prototype`: useful isolated functionality with explicit limitations.
- `disabled-until-reviewed`: registry entry only; no runtime activation is claimed.

## Next integration gate

Use the registry to select a candidate, record its exact source commit and license, import the smallest reusable module, then add a contract test. A module becomes activatable only after the GitHub Actions suite passes and its integration evidence is recorded.
