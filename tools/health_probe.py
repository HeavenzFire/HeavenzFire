#!/usr/bin/env python3
"""Probe explicitly configured HTTP health endpoints with fail-closed egress controls.

Loopback endpoints are allowed by default. Every non-loopback host must appear
in the registry's exact-match allowed_hosts list. HTTP redirects are not followed.
The tool performs health GET requests only and never executes a node.
"""
from __future__ import annotations

import argparse
import ipaddress
import math
import json
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

HOST_RE = re.compile(
    r"^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)"
    r"(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*$"
)


class NoRedirectHandler(HTTPRedirectHandler):
    """Prevent a configured health URL from redirecting the probe to another host."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _valid_allowlist_host(value: Any) -> bool:
    if not isinstance(value, str) or not value or value != value.strip():
        return False
    if "*" in value or "/" in value or "@" in value or "://" in value:
        return False
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return bool(HOST_RE.fullmatch(value))


def _is_loopback(hostname: str) -> bool:
    if hostname.lower().rstrip(".") == "localhost":
        return True
    try:
        return ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        return False


def _open_url(request: Request, timeout: float):
    """Open without following redirects, so allowlist checks cannot be bypassed."""
    return build_opener(NoRedirectHandler).open(request, timeout=timeout)


def validate_nodes(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict) or data.get("schema_version") != "1.0":
        return ["registry: expected object with schema_version '1.0'"]
    nodes = data.get("nodes")
    if not isinstance(nodes, list):
        return ["nodes: expected an array"]

    allowlist = data.get("allowed_hosts", [])
    allowed_hosts: set[str] = set()
    if not isinstance(allowlist, list):
        errors.append("allowed_hosts: expected an array of exact hostnames or IP addresses")
    else:
        for i, host in enumerate(allowlist):
            if not _valid_allowlist_host(host):
                errors.append(f"allowed_hosts[{i}]: expected an exact hostname or IP address without wildcards")
            else:
                allowed_hosts.add(host.lower().rstrip("."))

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
            continue
        host = parsed.hostname.lower().rstrip(".")
        if not _is_loopback(host) and host not in allowed_hosts:
            errors.append(f"{p}.health_url: host '{host}' is not loopback and is not in allowed_hosts")
    return errors


def probe_node(
    node: dict[str, Any],
    timeout: float = 2.0,
    allowed_hosts: list[str] | set[str] | None = None,
) -> dict[str, Any]:
    """Probe one node; non-loopback targets require an explicit exact-host allowlist."""
    node_id = node.get("id", "unknown")
    url = node.get("health_url", "")
    started = time.monotonic()
    if not math.isfinite(timeout) or timeout <= 0:
        return {"id": node_id, "status": "DARK", "reason": "timeout must be finite and positive",
                "http_status": None, "latency_ms": 0.0}
    parsed = urlparse(url) if isinstance(url, str) else None
    if (parsed is None or parsed.scheme not in {"http", "https"} or not parsed.hostname
            or parsed.username or parsed.password):
        return {"id": node_id, "status": "DARK", "reason": "health URL is invalid",
                "http_status": None, "latency_ms": 0.0}
    allowlist = {
        host.lower().rstrip(".")
        for host in (allowed_hosts or [])
        if _valid_allowlist_host(host)
    }
    host = parsed.hostname.lower().rstrip(".")
    if not _is_loopback(host) and host not in allowlist:
        return {"id": node_id, "status": "DARK", "reason": f"health host '{host}' is not allowlisted",
                "http_status": None, "latency_ms": 0.0}
    try:
        request = Request(url, headers={"Accept": "application/json", "User-Agent": "HeavenzFire-HealthProbe/1.1"})
        with _open_url(request, timeout=timeout) as response:
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
    if not math.isfinite(timeout) or timeout <= 0:
        errors.append("timeout: expected a finite positive number")
    if errors:
        return {"schema_version": "1.0", "overall": "DARK", "validation_errors": errors, "nodes": []}
    results = [probe_node(node, timeout, data.get("allowed_hosts", [])) for node in data["nodes"]]
    alive = sum(item["status"] == "ALIVE" for item in results)
    return {"schema_version": "1.0", "overall": "ALIVE" if results and alive == len(results) else "DARK",
            "summary": {"total": len(results), "alive": alive, "dark": len(results)-alive}, "nodes": results}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("registry", help="JSON node registry path")
    parser.add_argument("--timeout", type=float, default=2.0, help="per-node HTTP timeout in seconds (default: 2)")
    args = parser.parse_args(argv)
    if not math.isfinite(args.timeout) or args.timeout <= 0:
        parser.error("--timeout must be finite and positive")
    try:
        data = json.loads(Path(args.registry).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"overall": "DARK", "validation_errors": [f"cannot read valid JSON: {exc}"], "nodes": []}, indent=2))
        return 1
    result = run_registry(data, args.timeout)
    print(json.dumps(result, indent=2))
    return 1 if result["overall"] == "DARK" else 0


if __name__ == "__main__":
    raise SystemExit(main())
