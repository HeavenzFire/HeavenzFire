#!/usr/bin/env python3
"""Generate a bounded, self-similar HeavenzFire child-node scaffold."""
from __future__ import annotations

import argparse
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

NAME_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,47}$")
DEFAULT_CAPABILITIES = ["read-manifest", "local-compute", "emit-audit-record"]


def create_node(name: str, parent_id: str, output_dir: Path) -> Path:
    """Create a single child node; never overwrite or recursively clone."""
    if not NAME_PATTERN.fullmatch(name) or name in {".", ".."}:
        raise ValueError("name must be 1-48 letters, digits, dots, underscores, or hyphens and start alphanumeric")
    if not parent_id or len(parent_id) > 128 or any(ch in parent_id for ch in "\r\n\0"):
        raise ValueError("parent_id must be a non-empty, single-line identifier of at most 128 characters")

    output_dir = Path(output_dir).expanduser().resolve()
    destination = output_dir / name
    if destination.exists():
        raise FileExistsError(f"refusing to overwrite existing node: {destination}")

    manifest: dict[str, Any] = {
        "schema_version": "0.1.0",
        "node_id": f"hf-node-{uuid.uuid4()}",
        "name": name,
        "parent_id": parent_id,
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "state": "seeded",
        "capabilities": DEFAULT_CAPABILITIES,
        "network_access": False,
        "privileged_execution": False,
        "autostart": False
    }
    # Construct in a temporary sibling, then atomically rename into place.
    output_dir.mkdir(parents=True, exist_ok=True)
    staging = output_dir / f".{name}.staging-{uuid.uuid4().hex}"
    try:
        staging.mkdir()
        (staging / "node.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        (staging / "README.md").write_text(
            f"# {name}\n\n"
            f"Fractal child node seeded from parent `{parent_id}`.\n\n"
            f"Node ID: `{manifest['node_id']}`\n\n"
            "This is a scaffold only. It has no network listener, no privileged execution, "
            "and no automatic startup. Review its manifest and tests before activation.\n",
            encoding="utf-8"
        )
        (staging / "node.py").write_text(
            '"""Minimal offline status entry point for this generated node."""\n'
            'import json\n'
            'from pathlib import Path\n\n'
            'def main():\n'
            '    manifest = json.loads(Path(__file__).with_name("node.json").read_text(encoding="utf-8"))\n'
            '    print(json.dumps({"node_id": manifest["node_id"], "state": manifest["state"]}))\n\n'
            'if __name__ == "__main__":\n'
            '    main()\n',
            encoding="utf-8"
        )
        staging.rename(destination)
    except Exception:
        if staging.exists():
            import shutil
            shutil.rmtree(staging)
        raise
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True, help="child node name")
    parser.add_argument("--parent-id", required=True, help="parent node identifier")
    parser.add_argument("--output-dir", default="fractal/instances", help="directory to contain the child")
    args = parser.parse_args()
    try:
        destination = create_node(args.name, args.parent_id, Path(args.output_dir))
    except (ValueError, FileExistsError, OSError) as exc:
        parser.error(str(exc))
    print(f"CREATED {destination}")
    print(f"MANIFEST {destination / 'node.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
