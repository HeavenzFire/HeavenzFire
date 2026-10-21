#!/usr/bin/env python3
"""Dependency-free capability-registry validator for Python 3.10+."""

import json
import re
import sys
from pathlib import Path

ID_PATTERN = re.compile(r"^[a-z][a-z0-9-]{1,62}$")
VERSION_PATTERN = re.compile(r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?$")
STATUSES = {"proposed", "implemented", "verified", "deprecated"}
NETWORK_ACCESS = {"none", "allowlisted", "unrestricted"}
COMPONENT_KEYS = {
    "id", "version", "status", "data_classes", "network_access",
    "permissions", "entrypoints", "tests", "owner", "limitations",
}
TEST_KEYS = {"command", "last_result"}
TEST_RESULTS = {"not-run", "passed", "failed"}


def validate(document):
    errors = []
    if not isinstance(document, dict):
        return ["root must be a JSON object"]
    if set(document) != {"schema_version", "components"}:
        errors.append("root must contain only schema_version and components")
    if document.get("schema_version") != "1.0.0":
        errors.append("schema_version must be '1.0.0'")
    components = document.get("components")
    if not isinstance(components, list):
        return errors + ["components must be an array"]

    seen = set()
    for index, item in enumerate(components):
        prefix = f"components[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{prefix} must be an object")
            continue
        missing = COMPONENT_KEYS - set(item)
        extra = set(item) - COMPONENT_KEYS
        if missing:
            errors.append(f"{prefix} missing fields: {', '.join(sorted(missing))}")
        if extra:
            errors.append(f"{prefix} unknown fields: {', '.join(sorted(extra))}")
        component_id = item.get("id")
        if not isinstance(component_id, str) or not ID_PATTERN.fullmatch(component_id):
            errors.append(f"{prefix}.id must match {ID_PATTERN.pattern}")
        elif component_id in seen:
            errors.append(f"duplicate component id: {component_id}")
        else:
            seen.add(component_id)
        version = item.get("version")
        if not isinstance(version, str) or not VERSION_PATTERN.fullmatch(version):
            errors.append(f"{prefix}.version must be a semantic version")
        if item.get("status") not in STATUSES:
            errors.append(f"{prefix}.status must be one of {sorted(STATUSES)}")
        if item.get("network_access") not in NETWORK_ACCESS:
            errors.append(f"{prefix}.network_access must be one of {sorted(NETWORK_ACCESS)}")
        for field in ("data_classes", "permissions", "entrypoints", "limitations"):
            value = item.get(field)
            if not isinstance(value, list) or any(not isinstance(v, str) or not v.strip() for v in value):
                errors.append(f"{prefix}.{field} must be an array of non-empty strings")
        tests = item.get("tests")
        if not isinstance(tests, dict):
            errors.append(f"{prefix}.tests must be an object")
        else:
            if set(tests) != TEST_KEYS:
                errors.append(f"{prefix}.tests must contain only command and last_result")
            if not isinstance(tests.get("command"), str) or not tests.get("command", "").strip():
                errors.append(f"{prefix}.tests.command must be a non-empty string")
            if tests.get("last_result") not in TEST_RESULTS:
                errors.append(f"{prefix}.tests.last_result must be one of {sorted(TEST_RESULTS)}")
            if item.get("status") == "verified" and tests.get("last_result") != "passed":
                errors.append(f"{prefix}: verified status requires tests.last_result='passed'")
        for field in ("owner",):
            if not isinstance(item.get(field), str) or not item.get(field, "").strip():
                errors.append(f"{prefix}.{field} must be a non-empty string")
    return errors


def main(argv):
    if len(argv) != 2:
        print(f"Usage: {Path(argv[0]).name} PATH_TO_REGISTRY.json", file=sys.stderr)
        return 2
    path = Path(argv[1])
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        print(f"ERROR: cannot read {path}: {exc}", file=sys.stderr)
        return 2
    except json.JSONDecodeError as exc:
        print(f"ERROR: invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}", file=sys.stderr)
        return 2
    errors = validate(document)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        print(f"FAIL: {len(errors)} validation error(s)")
        return 1
    print(f"PASS: {len(document['components'])} component(s) validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
