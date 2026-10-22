# HeavenzFire Fractal Clone Fabric

## Meaning

A fractal clone is a self-similar, bounded HeavenzFire node seeded from a common template. It receives a unique node ID, a parent ID, a manifest, a README, and a minimal Python entry point. It does **not** recursively copy the entire repository, inherit secrets, or gain privileged capabilities automatically.

## Create a child node

From the repository root in the Codespace:

```bash
python tools/fractal_clone.py --name research-node-01 --parent-id heavenzfire-root --output-dir fractal/instances
```

The generator refuses invalid names and refuses to overwrite an existing node directory. It creates a node manifest recording identity, parent, UTC creation time, initial state, and explicitly bounded capabilities.

## Verification

```bash
python -m unittest discover -s tests -p 'test_*.py' -v
```

The tests exercise successful generation, identity/parent lineage, duplicate refusal, and invalid names. A generated child is a scaffold, not a running agent. Activation requires a separate runtime, a capability policy, health checks, and a human-authorized deployment path.
