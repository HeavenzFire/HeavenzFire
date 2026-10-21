#!/usr/bin/env python3
"""Validate a Unified Field capability registry using only the Python standard library.

Usage: python tools/validate_capabilities.py path/to/registry.json
Exit codes: 0 valid, 1 invalid registry or input.
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path
from typing import Any

ID_RE = re.compile(r"^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$")
VERSION_RE = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$")
TRUST_LEVELS = {"unverified", "local", "verified"}
ALLOWED_PERMISSIONS = {"read", "write", "network", "execute", "admin"}
REQUIRED = {"id", "name", "version", "entrypoint", "interfaces", "trust", "permissions"}

def validate_registry(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["registry: expected a JSON object"]
    if data.get("schema_version") != "1.0":
        errors.append("schema_version: expected '1.0'")
    capabilities = data.get("capabilities")
    if not isinstance(capabilities, list):
        return errors + ["capabilities: expected an array"]
    seen: set[str] = set()
    for i, cap in enumerate(capabilities):
        p = f"capabilities[{i}]"
        if not isinstance(cap, dict):
            errors.append(f"{p}: expected an object")
            continue
        missing = sorted(REQUIRED - cap.keys())
        if missing:
            errors.append(f"{p}: missing required fields: {', '.join(missing)}")
            continue
        cid = cap["id"]
        if not isinstance(cid, str) or not ID_RE.fullmatch(cid):
            errors.append(f"{p}.id: must be a lowercase identifier using letters, digits, '.', '_' or '-'")
        elif cid in seen:
            errors.append(f"{p}.id: duplicate capability id '{cid}'")
        else:
            seen.add(cid)
        if not isinstance(cap["name"], str) or not cap["name"].strip():
            errors.append(f"{p}.name: expected a non-empty string")
        if not isinstance(cap["version"], str) or not VERSION_RE.fullmatch(cap["version"]):
            errors.append(f"{p}.version: expected semantic version MAJOR.MINOR.PATCH")
        entrypoint = cap["entrypoint"]
        if not isinstance(entrypoint, str) or not entrypoint.strip() or entrypoint.startswith(("/", "\\")) or ".." in Path(entrypoint).parts:
            errors.append(f"{p}.entrypoint: expected a non-empty relative path without '..' traversal")
        interfaces = cap["interfaces"]
        if not isinstance(interfaces, list) or not interfaces or any(not isinstance(x, str) or not x.strip() for x in interfaces):
            errors.append(f"{p}.interfaces: expected a non-empty array of non-empty strings")
        trust = cap["trust"]
        if not isinstance(trust, str) or trust not in TRUST_LEVELS:
            errors.append(f"{p}.trust: expected one of {', '.join(sorted(TRUST_LEVELS))}")
        perms = cap["permissions"]
        if not isinstance(perms, list) or any(not isinstance(x, str) or x not in ALLOWED_PERMISSIONS for x in perms):
            errors.append(f"{p}.permissions: expected an array containing only {', '.join(sorted(ALLOWED_PERMISSIONS))}")
        elif len(perms) != len(set(perms)):
            errors.append(f"{p}.permissions: duplicate permissions are not allowed")
    return errors

def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: python tools/validate_capabilities.py <registry.json>", file=sys.stderr)
        return 1
    path = Path(argv[1])
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot read valid JSON from {path}: {exc}", file=sys.stderr)
        return 1
    errors = validate_registry(data)
    if errors:
        print("INVALID capability registry:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"VALID capability registry: {len(data['capabilities'])} capability(ies)")
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
