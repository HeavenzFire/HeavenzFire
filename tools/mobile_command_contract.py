"""Fail-closed contract for requests from the Android Unified Field command app.

This module validates a request envelope only. It does not authenticate a caller,
authorize a device, approve privileged work, or execute jobs; those are separate
server/companion responsibilities.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

SCHEMA_VERSION = "1.0"
MAX_ENVELOPE_BYTES = 16_384
MAX_TTL = timedelta(minutes=5)
ALLOWED_TARGETS = {"auto", "asus_windows", "android", "local_ai", "remote_provider"}
ALLOWED_ACTIONS = {
    "connection_check",
    "runtime_health",
    "list_top_processes",
    "disk_status",
    "unified_field_health",
    "run_repo_tests",
}
APPROVAL_REQUIRED = {"run_repo_tests"}
_REPO_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
_TOP_LEVEL_KEYS = {
    "schema_version", "request_id", "created_at", "expires_at",
    "target", "action", "params",
}


def _parse_utc(value: Any) -> datetime | None:
    if not isinstance(value, str) or len(value) > 64:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return None
    return parsed.astimezone(timezone.utc)


def validate_command_envelope(
    envelope: Any, *, now: datetime | None = None
) -> dict[str, Any]:
    """Return a deterministic validation result; invalid requests fail closed.

    The client cannot set an approval flag or supply arbitrary commands. The
    approval requirement is derived from the server-owned action allowlist.
    """
    errors: list[str] = []
    if not isinstance(envelope, dict):
        return {"valid": False, "errors": ["envelope_must_be_object"]}

    try:
        encoded_size = len(json.dumps(envelope, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    except (TypeError, ValueError, UnicodeError):
        return {"valid": False, "errors": ["envelope_not_json_serializable"]}
    if encoded_size > MAX_ENVELOPE_BYTES:
        return {"valid": False, "errors": ["envelope_too_large"]}

    unknown = set(envelope) - _TOP_LEVEL_KEYS
    missing = _TOP_LEVEL_KEYS - set(envelope)
    if unknown:
        errors.append("unknown_fields")
    if missing:
        errors.append("missing_fields")
    if envelope.get("schema_version") != SCHEMA_VERSION:
        errors.append("unsupported_schema_version")

    request_id = envelope.get("request_id")
    try:
        uuid.UUID(request_id) if isinstance(request_id, str) else None
        if not isinstance(request_id, str):
            raise ValueError
    except (ValueError, AttributeError):
        errors.append("invalid_request_id")

    created_at = _parse_utc(envelope.get("created_at"))
    expires_at = _parse_utc(envelope.get("expires_at"))
    if created_at is None:
        errors.append("invalid_created_at")
    if expires_at is None:
        errors.append("invalid_expires_at")

    clock = now or datetime.now(timezone.utc)
    if clock.tzinfo is None or clock.utcoffset() is None:
        errors.append("validation_clock_must_be_timezone_aware")
    else:
        clock = clock.astimezone(timezone.utc)
        if created_at is not None and expires_at is not None:
            if created_at > clock + timedelta(seconds=30):
                errors.append("created_at_in_future")
            if expires_at <= clock:
                errors.append("request_expired")
            if expires_at <= created_at or expires_at - created_at > MAX_TTL:
                errors.append("invalid_request_ttl")

    target = envelope.get("target")
    if not isinstance(target, str) or target not in ALLOWED_TARGETS:
        errors.append("unsupported_target")

    action = envelope.get("action")
    if not isinstance(action, str) or action not in ALLOWED_ACTIONS:
        errors.append("action_not_allowlisted")

    params = envelope.get("params")
    if not isinstance(params, dict):
        errors.append("params_must_be_object")
    elif isinstance(action, str) and action in ALLOWED_ACTIONS:
        if action == "run_repo_tests":
            if set(params) != {"repo_id"} or not isinstance(params.get("repo_id"), str) or not _REPO_ID.fullmatch(params.get("repo_id", "")):
                errors.append("invalid_params")
        elif params:
            errors.append("invalid_params")

    result: dict[str, Any] = {
        "valid": not errors,
        "errors": errors,
        "request_id": request_id if isinstance(request_id, str) else None,
    }
    if not errors:
        result.update({
            "schema_version": SCHEMA_VERSION,
            "target": target,
            "action": action,
            "params": dict(params),
            "requires_approval": action in APPROVAL_REQUIRED,
            "execution_status": "not_dispatched",
        })
    return result
