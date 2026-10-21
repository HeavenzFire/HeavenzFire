"""Tests for health registry validation and real-probe status semantics."""
import unittest
from unittest.mock import patch, MagicMock
from urllib.error import URLError
from tools.health_probe import validate_nodes, probe_node, run_registry

VALID = {"schema_version": "1.0", "nodes": [{"id": "node-a", "health_url": "http://127.0.0.1:8787/health"}]}

class HealthProbeTests(unittest.TestCase):
    def test_registry_validates(self):
        self.assertEqual(validate_nodes(VALID), [])

    def test_rejects_duplicate_ids(self):
        data = {"schema_version": "1.0", "nodes": VALID["nodes"] * 2}
        self.assertTrue(any("duplicate node id" in e for e in validate_nodes(data)))

    def test_rejects_non_http_scheme(self):
        data = {"schema_version": "1.0", "nodes": [{"id": "x", "health_url": "file:///etc/passwd"}]}
        self.assertTrue(any("HTTP(S)" in e for e in validate_nodes(data)))

    def test_rejects_embedded_credentials(self):
        data = {"schema_version": "1.0", "nodes": [{"id": "x", "health_url": "http://user:pass@localhost/health"}]}
        self.assertTrue(any("credentials" in e for e in validate_nodes(data)))

    @patch("tools.health_probe.urlopen")
    def test_http_success_is_alive(self, mocked):
        response = MagicMock()
        response.status = 200
        response.__enter__.return_value = response
        mocked.return_value = response
        self.assertEqual(probe_node(VALID["nodes"][0])["status"], "ALIVE")

    @patch("tools.health_probe.urlopen", side_effect=URLError("connection refused"))
    def test_connection_failure_is_dark(self, mocked):
        result = probe_node(VALID["nodes"][0])
        self.assertEqual(result["status"], "DARK")
        self.assertIn("failed", result["reason"])

    def test_invalid_registry_fails_closed(self):
        result = run_registry({"schema_version": "0", "nodes": []})
        self.assertEqual(result["overall"], "DARK")
        self.assertTrue(result["validation_errors"])

    @patch("tools.health_probe.probe_node")
    def test_overall_requires_every_node_alive(self, mocked):
        mocked.side_effect = [
            {"id": "a", "status": "ALIVE", "reason": "ok"},
            {"id": "b", "status": "DARK", "reason": "offline"}
        ]
        data = {"schema_version": "1.0", "nodes": [
            {"id": "a", "health_url": "http://localhost/a"},
            {"id": "b", "health_url": "http://localhost/b"}
        ]}
        result = run_registry(data)
        self.assertEqual(result["overall"], "DARK")
        self.assertEqual(result["summary"], {"total": 2, "alive": 1, "dark": 1})

if __name__ == "__main__":
    unittest.main()
