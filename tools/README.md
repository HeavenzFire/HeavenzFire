# Fractal clone generator

`fractal_clone.py` generates one bounded child-node scaffold at a time. It is deterministic in structure but assigns a new UUID and timestamp to each node. It refuses path-like names and existing destinations. It does not copy credentials, invoke network services, launch code, or recursively create descendants.

Example:
`python tools/fractal_clone.py --name worker-01 --parent-id heavenzfire-root --output-dir fractal/instances`
