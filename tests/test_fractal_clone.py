import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.fractal_clone import create_node


class FractalCloneTests(unittest.TestCase):
    def test_creates_node_with_parent_lineage_and_safe_defaults(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = create_node("node-a", "root-node", Path(tmp))
            manifest = json.loads((path / "node.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["name"], "node-a")
            self.assertEqual(manifest["parent_id"], "root-node")
            self.assertTrue(manifest["node_id"].startswith("hf-node-"))
            self.assertEqual(manifest["state"], "seeded")
            self.assertFalse(manifest["network_access"])
            self.assertFalse(manifest["privileged_execution"])
            self.assertFalse(manifest["autostart"])
            self.assertTrue((path / "node.py").is_file())
            self.assertTrue((path / "README.md").is_file())

    def test_generated_node_entrypoint_reports_identity_and_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = create_node("node-runtime", "root-node", Path(tmp))
            completed = subprocess.run(
                [sys.executable, str(path / "node.py")],
                cwd=path,
                capture_output=True,
                text=True,
                check=True,
            )
            result = json.loads(completed.stdout)
            manifest = json.loads((path / "node.json").read_text(encoding="utf-8"))
            self.assertEqual(
                result,
                {"node_id": manifest["node_id"], "state": "seeded"},
            )
            self.assertEqual(completed.stderr, "")

    def test_refuses_to_overwrite_existing_node(self):
        with tempfile.TemporaryDirectory() as tmp:
            create_node("node-a", "root-node", Path(tmp))
            with self.assertRaises(FileExistsError):
                create_node("node-a", "root-node", Path(tmp))

    def test_rejects_path_traversal_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                create_node("../outside", "root-node", Path(tmp))

    def test_rejects_invalid_parent_identifiers(self):
        invalid_parent_ids = ("", "line-one\nline-two", "bad\x00id", "x" * 129)
        with tempfile.TemporaryDirectory() as tmp:
            for parent_id in invalid_parent_ids:
                with self.subTest(parent_id=repr(parent_id)):
                    with self.assertRaises(ValueError):
                        create_node("node-a", parent_id, Path(tmp))

    def test_creates_missing_output_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp) / "nested" / "nodes"
            path = create_node("node-a", "root-node", output_dir)
            self.assertTrue(path.is_dir())
            self.assertEqual(path.parent, output_dir.resolve())

    def test_nodes_receive_unique_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a = json.loads((create_node("node-a", "root", root) / "node.json").read_text())
            b = json.loads((create_node("node-b", "root", root) / "node.json").read_text())
            self.assertNotEqual(a["node_id"], b["node_id"])


if __name__ == "__main__":
    unittest.main()
