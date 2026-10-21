#!/usr/bin/env python3
"""Combine capability declarations with observed node liveness into one JSON report.

Usage: python tools/unified_field.py examples/capability-registry.json examples/nodes.json
This is read-only discovery/diagnostics; it never invokes capability entrypoints.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
from typing import Any
from tools.health_probe import run_registry, validate_nodes
from tools.validate_capabilities import validate_registry

def build_report(capability_data: Any, node_data: Any, timeout: float = 2.0) -> dict[str, Any]:
    capability_errors = validate_registry(capability_data)
    node_errors = validate_nodes(node_data)
    if capability_errors or node_errors:
        return {
            "schema_version": "1.0",
            "overall": "DARK",
            "validation_errors": {
                "capabilities": capability_errors,
                "nodes": node_errors,
            },
            "capabilities": [],
            "nodes": [],
            "summary": {"capabilities": 0, "bound": 0, "unbound": 0, "alive": 0, "dark": 0},
        }

    health = run_registry(node_data, timeout)
    node_status = {node["id"]: node for node in health["nodes"]}
    capabilities = []
    bound = 0
    unbound = 0
    for capability in capability_data["capabilities"]:
        node_id = capability.get("node_id")
        observed = node_status.get(node_id) if isinstance(node_id, str) else None
        if observed:
            bound += 1
            state = observed["status"]
            reason = observed["reason"]
        else:
            unbound += 1
            state = "UNBOUND"
            reason = "capability has no matching node_id in the node registry"
        capabilities.append({
            "id": capability["id"],
            "name": capability["name"],
            "version": capability["version"],
            "node_id": node_id if isinstance(node_id, str) else None,
            "status": state,
            "reason": reason,
            "permissions_declared": capability["permissions"],
            "trust_declared": capability["trust"],
        })
    alive = health.get("summary", {}).get("alive", 0)
    dark = health.get("summary", {}).get("dark", 0)
    overall = "ALIVE" if health["overall"] == "ALIVE" and unbound == 0 else "DARK"
    return {
        "schema_version": "1.0",
        "overall": overall,
        "semantics": "ALIVE means all configured nodes passed HTTP liveness probes and every capability is bound to a registered node; it does not imply authorization or artifact verification.",
        "summary": {
            "capabilities": len(capabilities),
            "bound": bound,
            "unbound": unbound,
            "nodes": health.get("summary", {}).get("total", 0),
            "alive": alive,
            "dark": dark,
        },
        "capabilities": capabilities,
        "nodes": health["nodes"],
    }

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capabilities", help="capability registry JSON")
    parser.add_argument("nodes", help="node health registry JSON")
    parser.add_argument("--timeout", type=float, default=2.0, help="HTTP timeout per node (default: 2)")
    args = parser.parse_args(argv)
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    try:
        capabilities = json.loads(Path(args.capabilities).read_text(encoding="utf-8"))
        nodes = json.loads(Path(args.nodes).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"schema_version": "1.0", "overall": "DARK",
                          "validation_errors": [f"cannot read valid JSON: {exc}"]}, indent=2))
        return 1
    report = build_report(capabilities, nodes, args.timeout)
    print(json.dumps(report, indent=2))
    return 0 if report["overall"] == "ALIVE" else 1

if __name__ == "__main__":
    raise SystemExit(main())
