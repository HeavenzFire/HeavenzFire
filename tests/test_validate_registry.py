import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from validate_registry import validate


def component(component_id="sample-component"):
    return {
        "id": component_id,
        "version": "0.1.0",
        "status": "implemented",
        "data_classes": ["public-metadata"],
        "network_access": "none",
        "permissions": ["read-file"],
        "entrypoints": ["python app.py"],
        "tests": {"command": "python -m unittest", "last_result": "not-run"},
        "owner": "test-owner",
        "limitations": [],
    }


class RegistryValidatorTests(unittest.TestCase):
    def test_accepts_valid_registry(self):
        self.assertEqual(validate({"schema_version": "1.0.0", "components": [component()]}), [])

    def test_rejects_missing_required_field(self):
        item = component()
        del item["owner"]
        self.assertTrue(any("missing fields: owner" in e for e in validate({"schema_version": "1.0.0", "components": [item]})))

    def test_rejects_invalid_status(self):
        item = component()
        item["status"] = "trusted"
        self.assertTrue(any(".status must be one of" in e for e in validate({"schema_version": "1.0.0", "components": [item]})))

    def test_rejects_duplicate_ids(self):
        self.assertTrue(any("duplicate component id" in e for e in validate({"schema_version": "1.0.0", "components": [component(), component()]})))

    def test_verified_requires_passing_tests(self):
        item = component()
        item["status"] = "verified"
        item["tests"]["last_result"] = "not-run"
        self.assertTrue(any("verified status requires" in e for e in validate({"schema_version": "1.0.0", "components": [item]})))

    def test_rejects_invalid_json_root_type(self):
        self.assertTrue(any("root must be a JSON object" in e for e in validate(["not", "an", "object"])))

    def test_rejects_invalid_semver(self):
        item = component()
        item["version"] = "latest"
        self.assertTrue(any(".version must be a semantic version" in e for e in validate({"schema_version": "1.0.0", "components": [item]})))


if __name__ == "__main__":
    unittest.main()
