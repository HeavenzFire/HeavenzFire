import json
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

    def test_refuses_to_overwrite_existing_node(self):
        with tempfile.TemporaryDirectory() as tmp:
            create_node("node-a", "root-node", Path(tmp))
            with self.assertRaises(FileExistsError):
                create_node("node-a", "root-node", Path(tmp))

    def test_rejects_path_traversal_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                create_node("../outside", "root-node", Path(tmp))

    def test_nodes_receive_unique_ids(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a = json.loads((create_node("node-a", "root", root) / "node.json").read_text())
            b = json.loads((create_node("node-b", "root", root) / "node.json").read_text())
            self.assertNotEqual(a["node_id"], b["node_id"])


if __name__ == "__main__":
    unittest.main()
