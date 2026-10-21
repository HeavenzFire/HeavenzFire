#!/usr/bin/env python3
"""Fail-closed consent policy evaluator. This module authorizes decisions only; it performs no network transfer."""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

POLICY_KEYS = {"schema_version", "grants"}
GRANT_KEYS = {"id", "subject", "action", "data_classes", "destination", "purpose", "status"}
REQUEST_KEYS = {"subject", "action", "data_classes", "destination", "purpose"}
STATUSES = {"active", "revoked"}


def validate_policy(policy: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(policy, dict):
        return ["policy must be a JSON object"]
    if set(policy) != POLICY_KEYS:
        errors.append("policy must contain only schema_version and grants")
    if policy.get("schema_version") != "1.0":
        errors.append("schema_version must be '1.0'")
    grants = policy.get("grants")
    if not isinstance(grants, list):
        return errors + ["grants must be an array"]
    seen: set[str] = set()
    for index, grant in enumerate(grants):
        prefix = f"grants[{index}]"
        if not isinstance(grant, dict):
            errors.append(f"{prefix} must be an object")
            continue
        missing = GRANT_KEYS - set(grant)
        extra = set(grant) - GRANT_KEYS
        if missing:
            errors.append(f"{prefix} missing fields: {', '.join(sorted(missing))}")
        if extra:
            errors.append(f"{prefix} unknown fields: {', '.join(sorted(extra))}")
        for field in ("id", "subject", "action", "destination", "purpose"):
            value = grant.get(field)
            if not isinstance(value, str) or not value.strip():
                errors.append(f"{prefix}.{field} must be a non-empty string")
            elif "*" in value:
                errors.append(f"{prefix}.{field} must not contain wildcard characters")
        grant_id = grant.get("id")
        if isinstance(grant_id, str):
            if grant_id in seen:
                errors.append(f"duplicate grant id: {grant_id}")
            seen.add(grant_id)
        classes = grant.get("data_classes")
        if (not isinstance(classes, list) or not classes
                or any(not isinstance(value, str) or not value.strip() or "*" in value for value in classes)
                or len(classes) != len(set(classes) if isinstance(classes, list) else [])):
            errors.append(f"{prefix}.data_classes must be a non-empty array of unique non-empty strings")
        status = grant.get("status")
        if not isinstance(status, str) or status not in STATUSES:
            errors.append(f"{prefix}.status must be one of {sorted(STATUSES)}")
    return errors


def authorize(policy: Any, request: Any) -> dict[str, Any]:
    """Return a deterministic allow/deny result; invalid policy or request always denies."""
    policy_errors = validate_policy(policy)
    if policy_errors:
        return {"allowed": False, "reason": "invalid_policy", "details": policy_errors}
    if not isinstance(request, dict) or set(request) != REQUEST_KEYS:
        return {"allowed": False, "reason": "invalid_request", "details": ["request must contain exactly subject, action, data_classes, destination, purpose"]}
    for field in ("subject", "action", "destination", "purpose"):
        if not isinstance(request.get(field), str) or not request[field].strip() or "*" in request[field]:
            return {"allowed": False, "reason": "invalid_request", "details": [f"{field} must be a non-empty string without wildcards"]}
    requested_classes = request.get("data_classes")
    if (not isinstance(requested_classes, list) or not requested_classes
            or any(not isinstance(value, str) or not value.strip() for value in requested_classes)
            or len(requested_classes) != len(set(requested_classes) if isinstance(requested_classes, list) else [])):
        return {"allowed": False, "reason": "invalid_request", "details": ["data_classes must be a non-empty array of unique non-empty strings"]}

    matching_scope = []
    for grant in policy["grants"]:
        if (grant.get("subject") == request["subject"]
                and grant.get("action") == request["action"]
                and grant.get("destination") == request["destination"]
                and grant.get("purpose") == request["purpose"]):
            matching_scope.append(grant)
    for grant in matching_scope:
        if grant["status"] != "active":
            continue
        if set(requested_classes).issubset(set(grant["data_classes"])):
            return {"allowed": True, "reason": "active_grant_matches_exact_scope", "grant_id": grant["id"]}
    if any(grant.get("status") == "revoked" for grant in matching_scope):
        return {"allowed": False, "reason": "consent_revoked", "details": []}
    if matching_scope:
        return {"allowed": False, "reason": "data_class_not_granted", "details": []}
    return {"allowed": False, "reason": "no_matching_consent", "details": []}


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("Usage: python tools/policy_gate.py POLICY.json REQUEST.json", file=sys.stderr)
        return 2
    try:
        policy = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
        request = json.loads(Path(argv[2]).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: unable to read valid JSON: {exc}", file=sys.stderr)
        return 2
    result = authorize(policy, request)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["allowed"] else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
