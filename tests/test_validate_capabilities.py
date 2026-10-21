"""Unit tests for the dependency-free Unified Field capability registry validator."""
import unittest
from tools.validate_capabilities import validate_registry

VALID = {
    "schema_version": "1.0",
    "capabilities": [{
        "id": "local.model",
        "name": "Local Model",
        "version": "1.2.3",
        "entrypoint": "agents/local_model.py",
        "interfaces": ["http"],
        "trust": "local",
        "permissions": ["read"]
    }]
}

class RegistryValidationTests(unittest.TestCase):
    def test_valid_registry(self):
        self.assertEqual(validate_registry(VALID), [])

    def test_rejects_non_object(self):
        self.assertIn("registry: expected a JSON object", validate_registry([]))

    def test_rejects_duplicate_ids(self):
        data = {**VALID, "capabilities": VALID["capabilities"] * 2}
        self.assertTrue(any("duplicate capability id" in e for e in validate_registry(data)))

    def test_rejects_path_traversal(self):
        cap = {**VALID["capabilities"][0], "entrypoint": "../secret.txt"}
        self.assertTrue(any("entrypoint" in e for e in validate_registry({**VALID, "capabilities": [cap]})))

    def test_rejects_unknown_permissions(self):
        cap = {**VALID["capabilities"][0], "permissions": ["root_everything"]}
        self.assertTrue(any("permissions" in e for e in validate_registry({**VALID, "capabilities": [cap]})))

    def test_requires_semver(self):
        cap = {**VALID["capabilities"][0], "version": "latest"}
        self.assertTrue(any("semantic version" in e for e in validate_registry({**VALID, "capabilities": [cap]})))

    def test_rejects_unknown_trust(self):
        cap = {**VALID["capabilities"][0], "trust": "trusted-because-i-say-so"}
        self.assertTrue(any("trust" in e for e in validate_registry({**VALID, "capabilities": [cap]})))

    def test_reports_missing_fields(self):
        self.assertTrue(any("missing required fields" in e for e in validate_registry({
            "schema_version": "1.0", "capabilities": [{"id": "x"}]
        })))

if __name__ == "__main__":
    unittest.main()
