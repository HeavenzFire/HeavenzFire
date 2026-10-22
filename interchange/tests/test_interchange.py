#!/usr/bin/env python3
"""Dependency-free conformance tests for HeavenzFire interchange v0.1.0.

These tests validate the repository's canonical schema contract. They are not
claimed to be the missing external/original Meta AI test_interchange.py.
Run: python -m unittest discover -s interchange/tests -v
"""
import json
import re
import unittest
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "interchange_schema_v0.1.0.json"
EXAMPLE_PATH = ROOT / "interchange_example_v0.1.0.json"
EXPORT_PATH = ROOT / "exports" / "chatgpt_interchange_export_v0.1.0.json"
REGISTRY_PATH = ROOT / "registries" / "chatgpt_capability_registry_entry_v0.1.0.json"
REQUIRED_EXPORT = {"version", "project_id", "source_platform", "conversation_reference",
                   "objective", "decisions", "task_status", "artifacts", "test_results",
                   "next_actions", "permissions", "timestamp"}
REQUIRED_PERMISSIONS = {"allow_network", "allow_code_exec", "allow_file_write",
                        "sensitive_actions_require_explicit_auth"}

def read_json(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)

def validate_contract(payload):
    errors = []
    if not isinstance(payload, dict):
        return ["root must be an object"]
    missing = REQUIRED_EXPORT - payload.keys()
    if missing:
        errors.append("missing top-level fields: " + ", ".join(sorted(missing)))
    if payload.get("version") != "0.1.0":
        errors.append("version must equal 0.1.0")
    for key in ("decisions", "task_status", "artifacts", "test_results", "next_actions"):
        if key in payload and not isinstance(payload[key], list):
            errors.append(key + " must be an array")
    perms = payload.get("permissions")
    if not isinstance(perms, dict):
        errors.append("permissions must be an object")
    elif REQUIRED_PERMISSIONS - perms.keys():
        errors.append("permissions missing required flags")
    for item in payload.get("task_status", []):
        if not isinstance(item, dict) or not all(k in item for k in ("task_id", "title", "status", "owner")):
            errors.append("each task_status item requires task_id, title, status, owner")
    for item in payload.get("test_results", []):
        if not isinstance(item, dict) or not all(k in item for k in ("test_id", "passed", "output")):
            errors.append("each test_result requires test_id, passed, output")
        elif not isinstance(item["passed"], bool):
            errors.append("test_result passed must be boolean")
    ts = payload.get("timestamp")
    if isinstance(ts, str):
        try:
            datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            errors.append("timestamp must be ISO-8601")
    return errors

class InterchangeContractTests(unittest.TestCase):
    def test_1_schema_is_valid_json_and_declares_required_contract(self):
        schema = read_json(SCHEMA_PATH)
        self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
        self.assertEqual(schema["type"], "object")
        self.assertTrue(REQUIRED_EXPORT.issubset(set(schema["required"])))

    def test_2_example_conforms_to_contract(self):
        example = read_json(EXAMPLE_PATH)
        self.assertEqual(validate_contract(example), [])

    def test_3_current_export_conforms_to_contract(self):
        export = read_json(EXPORT_PATH)
        self.assertEqual(validate_contract(export), [])

    def test_4_capability_registry_reports_distinct_dimensions(self):
        registry = read_json(REGISTRY_PATH)
        capabilities = registry["capabilities"]
        for name in ("file_write", "code_exec", "browsing", "network", "share_url_fetch"):
            self.assertIn(name, capabilities)
            self.assertIn("status", capabilities[name])
            self.assertIn("evidence", capabilities[name])

    def test_5_share_urls_and_sensitive_permissions_are_explicit(self):
        export = read_json(EXPORT_PATH)
        ref = export["conversation_reference"]
        self.assertFalse(ref.get("retrievable", False))
        self.assertIsNone(ref.get("share_url"))
        self.assertTrue(export["permissions"]["sensitive_actions_require_explicit_auth"])

if __name__ == "__main__":
    unittest.main(verbosity=2)
