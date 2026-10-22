# Persistent HeavenzFire workspace

This repository is the versioned source of truth. Use a GitHub Codespace as a repeatable working environment, and push changes frequently so the durable record is in Git rather than only in a running VM.

## Start here

- `.devcontainer/devcontainer.json` — repeatable Codespaces environment.
- `presence/README.md` — permanence and status-reporting contract.
- `interchange/` — cross-AI interchange artifacts.
- `fractal/` — self-similar child-node blueprint and clone generator.
- `tests/test_fractal_clone.py` — regression tests for safe clone generation.

## Development rule

Every child node has a unique ID, a parent ID, a manifest, and explicit scope. A clone is a seeded, bounded module—not an uncontrolled recursive copy of the entire repository. Keep secrets out of Git, keep ports private by default, and do not claim runtime health without a fresh health check.
