import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from policy_gate import authorize, validate_policy


def sample_policy(status="active"):
    return {
        "schema_version": "1.0",
        "grants": [{
            "id": "grant-001",
            "subject": "local-user",
            "action": "export",
            "data_classes": ["profile-summary", "user-created-notes"],
            "destination": "https://archive.example",
            "purpose": "user-requested-backup",
            "status": status,
        }],
    }


def sample_request(**overrides):
    request = {
        "subject": "local-user",
        "action": "export",
        "data_classes": ["profile-summary"],
        "destination": "https://archive.example",
        "purpose": "user-requested-backup",
    }
    request.update(overrides)
    return request


class ConsentPolicyGateTests(unittest.TestCase):
    def test_exact_active_grant_allows_subset(self):
        result = authorize(sample_policy(), sample_request())
        self.assertTrue(result["allowed"])
        self.assertEqual(result["grant_id"], "grant-001")

    def test_no_consent_denies_by_default(self):
        self.assertEqual(authorize({"schema_version": "1.0", "grants": []}, sample_request())["reason"], "no_matching_consent")

    def test_revoked_consent_denies(self):
        self.assertEqual(authorize(sample_policy("revoked"), sample_request())["reason"], "consent_revoked")

    def test_unlisted_destination_denies(self):
        request = sample_request(destination="https://other.example")
        self.assertFalse(authorize(sample_policy(), request)["allowed"])

    def test_purpose_mismatch_denies(self):
        request = sample_request(purpose="targeted-advertising")
        self.assertFalse(authorize(sample_policy(), request)["allowed"])

    def test_unapproved_data_class_denies(self):
        request = sample_request(data_classes=["profile-summary", "precise-location"])
        self.assertEqual(authorize(sample_policy(), request)["reason"], "data_class_not_granted")

    def test_invalid_policy_fails_closed(self):
        self.assertEqual(authorize({"schema_version": "1.0", "grants": [{"status": "active"}]}, sample_request())["reason"], "invalid_policy")

    def test_duplicate_grant_ids_are_invalid(self):
        policy = sample_policy()
        policy["grants"].append(dict(policy["grants"][0]))
        self.assertTrue(any("duplicate grant id" in error for error in validate_policy(policy)))

    def test_wildcard_grant_scope_is_invalid(self):
        policy = sample_policy()
        policy["grants"][0]["destination"] = "*"
        self.assertEqual(authorize(policy, sample_request())["reason"], "invalid_policy")

    def test_wildcard_data_class_request_denies(self):
        request = sample_request(data_classes=["*"])
        self.assertEqual(authorize(sample_policy(), request)["reason"], "invalid_request")

    def test_unhashable_status_type_fails_closed(self):
        policy = sample_policy()
        policy["grants"][0]["status"] = ["active"]
        self.assertEqual(authorize(policy, sample_request())["reason"], "invalid_policy")

    def test_malformed_request_denies(self):
        self.assertEqual(authorize(sample_policy(), {"subject": "local-user"})["reason"], "invalid_request")

    def test_duplicate_requested_data_classes_deny(self):
        request = sample_request(data_classes=["profile-summary", "profile-summary"])
        self.assertEqual(authorize(sample_policy(), request)["reason"], "invalid_request")


if __name__ == "__main__":
    unittest.main()
