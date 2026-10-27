"""Tests for the crosswalk between capability declarations and observed node health."""
import unittest
import contextlib
import io
import sys
from unittest.mock import patch
from tools.unified_field import build_report, main

CAPS = {"schema_version": "1.0", "capabilities": [{
    "id": "local.model", "name": "Local Model", "version": "1.0.0",
    "entrypoint": "agents/local_model.py", "interfaces": ["http"],
    "trust": "local", "permissions": ["read"], "node_id": "agent-a"
}]}
NODES = {"schema_version": "1.0", "nodes": [{"id": "agent-a", "health_url": "http://127.0.0.1:8790/health"}]}

class UnifiedFieldReportTests(unittest.TestCase):
    def test_report_api_rejects_non_finite_or_non_positive_timeout(self):
        for value in (float("nan"), float("inf"), float("-inf"), 0, -1):
            with self.subTest(timeout=value):
                report = build_report(CAPS, NODES, timeout=value)
                self.assertEqual(report["overall"], "DARK")
                self.assertIn("finite positive", report["validation_errors"]["timeout"][0])
                self.assertEqual(report["capabilities"], [])
                self.assertEqual(report["nodes"], [])

    def test_cli_rejects_non_finite_or_non_positive_timeout(self):
        for value in ("nan", "inf", "-inf", "0", "-1"):
            with self.subTest(timeout=value):
                stderr = io.StringIO()
                with patch.object(sys, "argv", ["unified_field.py", "caps.json", "nodes.json", "--timeout=" + value]):
                    with contextlib.redirect_stderr(stderr):
                        with self.assertRaises(SystemExit) as raised:
                            main()
                self.assertEqual(raised.exception.code, 2)
                self.assertIn("finite and positive", stderr.getvalue())

    @patch("tools.unified_field.run_registry")
    def test_bound_live_capability_reports_alive(self, mocked):
        mocked.return_value = {"schema_version": "1.0", "overall": "ALIVE",
            "summary": {"total": 1, "alive": 1, "dark": 0},
            "nodes": [{"id": "agent-a", "status": "ALIVE", "reason": "HTTP success"}]}
        report = build_report(CAPS, NODES)
        self.assertEqual(report["overall"], "ALIVE")
        self.assertEqual(report["capabilities"][0]["status"], "ALIVE")
        self.assertEqual(report["summary"]["bound"], 1)

    @patch("tools.unified_field.run_registry")
    def test_unbound_capability_fails_closed(self, mocked):
        mocked.return_value = {"schema_version": "1.0", "overall": "ALIVE",
            "summary": {"total": 1, "alive": 1, "dark": 0},
            "nodes": [{"id": "agent-a", "status": "ALIVE", "reason": "HTTP success"}]}
        caps = {"schema_version": "1.0", "capabilities": [{**CAPS["capabilities"][0], "node_id": "missing"}]}
        report = build_report(caps, NODES)
        self.assertEqual(report["overall"], "DARK")
        self.assertEqual(report["capabilities"][0]["status"], "UNBOUND")
        self.assertEqual(report["summary"]["unbound"], 1)

    def test_invalid_registry_fails_closed(self):
        report = build_report({"schema_version": "1.0", "capabilities": []}, {"schema_version": "bad", "nodes": []})
        self.assertEqual(report["overall"], "DARK")
        self.assertTrue(report["validation_errors"]["nodes"])

    @patch("tools.unified_field.run_registry")
    def test_dark_node_propagates_to_capability(self, mocked):
        mocked.return_value = {"schema_version": "1.0", "overall": "DARK",
            "summary": {"total": 1, "alive": 0, "dark": 1},
            "nodes": [{"id": "agent-a", "status": "DARK", "reason": "connection refused"}]}
        report = build_report(CAPS, NODES)
        self.assertEqual(report["overall"], "DARK")
        self.assertEqual(report["capabilities"][0]["status"], "DARK")
        self.assertIn("connection refused", report["capabilities"][0]["reason"])

if __name__ == "__main__":
    unittest.main()
