"""Tests for health registry validation, egress allowlists, and probe status semantics."""
import unittest
from unittest.mock import patch, MagicMock
from urllib.error import URLError
from urllib.request import Request

from tools.health_probe import (
    NoRedirectHandler, validate_nodes, probe_node, run_registry,
)

VALID = {
    "schema_version": "1.0",
    "nodes": [{"id": "node-a", "health_url": "http://127.0.0.1:8787/health"}],
}


class HealthProbeTests(unittest.TestCase):
    def test_registry_validates_loopback_endpoint(self):
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

    def test_external_host_requires_explicit_allowlist(self):
        data = {"schema_version": "1.0", "nodes": [{"id": "remote", "health_url": "https://api.example.com/health"}]}
        self.assertTrue(any("not in allowed_hosts" in e for e in validate_nodes(data)))

    def test_explicitly_allowlisted_external_host_is_valid(self):
        data = {
            "schema_version": "1.0",
            "allowed_hosts": ["api.example.com"],
            "nodes": [{"id": "remote", "health_url": "https://api.example.com/health"}],
        }
        self.assertEqual(validate_nodes(data), [])

    def test_wildcard_allowlist_is_rejected(self):
        data = {
            "schema_version": "1.0",
            "allowed_hosts": ["*.example.com"],
            "nodes": [{"id": "remote", "health_url": "https://api.example.com/health"}],
        }
        self.assertTrue(any("without wildcards" in e for e in validate_nodes(data)))

    def test_non_loopback_node_with_invalid_allowlist_fails_closed(self):
        data = {
            "schema_version": "1.0",
            "allowed_hosts": "api.example.com",
            "nodes": [{"id": "remote", "health_url": "https://api.example.com/health"}],
        }
        self.assertTrue(any("allowed_hosts: expected an array" in e for e in validate_nodes(data)))

    def test_direct_probe_rejects_unallowlisted_external_host(self):
        result = probe_node({"id": "remote", "health_url": "https://api.example.com/health"})
        self.assertEqual(result["status"], "DARK")
        self.assertIn("not allowlisted", result["reason"])

    def test_redirect_handler_does_not_follow_redirects(self):
        handler = NoRedirectHandler()
        request = Request("http://127.0.0.1/start")
        self.assertIsNone(handler.redirect_request(request, None, 302, "Found", {}, "http://example.com/target"))

    @patch("tools.health_probe._open_url")
    def test_http_success_is_alive(self, mocked):
        response = MagicMock()
        response.status = 200
        response.__enter__.return_value = response
        mocked.return_value = response
        self.assertEqual(probe_node(VALID["nodes"][0])["status"], "ALIVE")

    @patch("tools.health_probe._open_url", side_effect=URLError("connection refused"))
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
            {"id": "b", "status": "DARK", "reason": "offline"},
        ]
        data = {"schema_version": "1.0", "nodes": [
            {"id": "a", "health_url": "http://localhost/a"},
            {"id": "b", "health_url": "http://localhost/b"},
        ]}
        result = run_registry(data)
        self.assertEqual(result["overall"], "DARK")
        self.assertEqual(result["summary"], {"total": 2, "alive": 1, "dark": 1})


if __name__ == "__main__":
    unittest.main()
