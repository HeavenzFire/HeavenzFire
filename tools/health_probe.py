#!/usr/bin/env python3
"""Probe configured HTTP health endpoints and emit machine-readable ALIVE/DARK status.

The tool never executes a node. It performs HTTP GET requests only.
Usage: python tools/health_probe.py examples/nodes.json [--timeout 2.0]
"""
from __future__ import annotations
import argparse
import json
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

def validate_nodes(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict) or data.get("schema_version") != "1.0":
        return ["registry: expected object with schema_version '1.0'"]
    nodes = data.get("nodes")
    if not isinstance(nodes, list):
        return ["nodes: expected an array"]
    seen: set[str] = set()
    for i, node in enumerate(nodes):
        p = f"nodes[{i}]"
        if not isinstance(node, dict):
            errors.append(f"{p}: expected an object")
            continue
        node_id, url = node.get("id"), node.get("health_url")
        if not isinstance(node_id, str) or not node_id.strip():
            errors.append(f"{p}.id: expected a non-empty string")
        elif node_id in seen:
            errors.append(f"{p}.id: duplicate node id '{node_id}'")
        else:
            seen.add(node_id)
        if not isinstance(url, str):
            errors.append(f"{p}.health_url: expected an HTTP(S) URL")
            continue
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            errors.append(f"{p}.health_url: expected an HTTP(S) URL without embedded credentials")
    return errors

def probe_node(node: dict[str, Any], timeout: float = 2.0) -> dict[str, Any]:
    """Return ALIVE only for an HTTP 2xx response; never infer liveness from configuration."""
    node_id = node.get("id", "unknown")
    url = node.get("health_url", "")
    started = time.monotonic()
    try:
        request = Request(url, headers={"Accept": "application/json", "User-Agent": "HeavenzFire-HealthProbe/1.0"})
        with urlopen(request, timeout=timeout) as response:
            code = response.status
            if 200 <= code < 300:
                return {"id": node_id, "status": "ALIVE", "reason": "health endpoint returned HTTP success",
                        "http_status": code, "latency_ms": round((time.monotonic()-started)*1000, 2)}
            return {"id": node_id, "status": "DARK", "reason": f"health endpoint returned HTTP {code}",
                    "http_status": code, "latency_ms": round((time.monotonic()-started)*1000, 2)}
    except HTTPError as exc:
        return {"id": node_id, "status": "DARK", "reason": f"health endpoint returned HTTP {exc.code}",
                "http_status": exc.code, "latency_ms": round((time.monotonic()-started)*1000, 2)}
    except (URLError, TimeoutError, OSError, ValueError) as exc:
        reason = "health endpoint timed out" if isinstance(exc, TimeoutError) else f"health probe failed: {exc}"
        return {"id": node_id, "status": "DARK", "reason": reason,
                "http_status": None, "latency_ms": round((time.monotonic()-started)*1000, 2)}

def run_registry(data: dict[str, Any], timeout: float = 2.0) -> dict[str, Any]:
    errors = validate_nodes(data)
    if errors:
        return {"schema_version": "1.0", "overall": "DARK", "validation_errors": errors, "nodes": []}
    results = [probe_node(node, timeout) for node in data["nodes"]]
    alive = sum(item["status"] == "ALIVE" for item in results)
    return {"schema_version": "1.0", "overall": "ALIVE" if results and alive == len(results) else "DARK",
            "summary": {"total": len(results), "alive": alive, "dark": len(results)-alive}, "nodes": results}

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("registry", help="JSON node registry path")
    parser.add_argument("--timeout", type=float, default=2.0, help="per-node HTTP timeout in seconds (default: 2)")
    args = parser.parse_args(argv)
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    try:
        data = json.loads(__import__("pathlib").Path(args.registry).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"overall": "DARK", "validation_errors": [f"cannot read valid JSON: {exc}"], "nodes": []}, indent=2))
        return 1
    result = run_registry(data, args.timeout)
    print(json.dumps(result, indent=2))
    return 1 if result["overall"] == "DARK" else 0

if __name__ == "__main__":
    raise SystemExit(main())
