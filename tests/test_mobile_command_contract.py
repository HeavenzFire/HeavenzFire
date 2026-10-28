import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from mobile_command_contract import validate_command_envelope


NOW = datetime(2026, 10, 28, 12, 0, tzinfo=timezone.utc)


def envelope(**overrides):
    value = {
        "schema_version": "1.0",
        "request_id": str(uuid.UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")),
        "created_at": (NOW - timedelta(seconds=5)).isoformat(),
        "expires_at": (NOW + timedelta(minutes=1)).isoformat(),
        "target": "asus_windows",
        "action": "runtime_health",
        "params": {},
    }
    value.update(overrides)
    return value


class MobileCommandContractTests(unittest.TestCase):
    def test_allowlisted_request_is_valid_but_not_dispatched(self):
        result = validate_command_envelope(envelope(), now=NOW)
        self.assertTrue(result["valid"])
        self.assertEqual(result["execution_status"], "not_dispatched")
        self.assertFalse(result["requires_approval"])

    def test_privileged_job_requires_server_approval(self):
        result = validate_command_envelope(
            envelope(action="run_repo_tests", params={"repo_id": "heavenzfire"}),
            now=NOW,
        )
        self.assertTrue(result["valid"])
        self.assertTrue(result["requires_approval"])

    def test_client_cannot_supply_approval_flag(self):
        result = validate_command_envelope(envelope(approved=True), now=NOW)
        self.assertFalse(result["valid"])
        self.assertIn("unknown_fields", result["errors"])

    def test_arbitrary_shell_action_is_denied(self):
        result = validate_command_envelope(envelope(action="arbitrary_shell", params={"command": "whoami"}), now=NOW)
        self.assertFalse(result["valid"])
        self.assertIn("action_not_allowlisted", result["errors"])

    def test_unknown_target_is_denied(self):
        self.assertIn("unsupported_target", validate_command_envelope(envelope(target="internet"), now=NOW)["errors"])

    def test_extra_parameters_are_denied(self):
        result = validate_command_envelope(envelope(action="runtime_health", params={"path": "C:\\\"}), now=NOW)
        self.assertIn("invalid_params", result["errors"])

    def test_repo_id_must_be_an_opaque_slug(self):
        result = validate_command_envelope(envelope(action="run_repo_tests", params={"repo_id": "../../secrets"}), now=NOW)
        self.assertIn("invalid_params", result["errors"])

    def test_expired_request_is_denied(self):
        result = validate_command_envelope(envelope(expires_at=(NOW - timedelta(seconds=1)).isoformat()), now=NOW)
        self.assertIn("request_expired", result["errors"])

    def test_ttl_over_five_minutes_is_denied(self):
        result = validate_command_envelope(envelope(expires_at=(NOW + timedelta(minutes=6)).isoformat()), now=NOW)
        self.assertIn("invalid_request_ttl", result["errors"])

    def test_naive_timestamps_are_denied(self):
        result = validate_command_envelope(envelope(created_at="2026-10-28T11:59:55", expires_at="2026-10-28T12:01:00"), now=NOW)
        self.assertIn("invalid_created_at", result["errors"])
        self.assertIn("invalid_expires_at", result["errors"])

    def test_unknown_fields_and_missing_fields_are_denied(self):
        result = validate_command_envelope({"schema_version": "1.0", "made_up": True}, now=NOW)
        self.assertIn("unknown_fields", result["errors"])
        self.assertIn("missing_fields", result["errors"])

    def test_non_object_and_oversized_payloads_fail_closed(self):
        self.assertFalse(validate_command_envelope("run shell", now=NOW)["valid"])
        huge = envelope(params={"data": "x" * 17000})
        self.assertIn("envelope_too_large", validate_command_envelope(huge, now=NOW)["errors"])


if __name__ == "__main__":
    unittest.main()
