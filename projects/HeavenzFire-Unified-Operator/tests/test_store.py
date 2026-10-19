import tempfile
import unittest
from pathlib import Path
from heavenzfire_operator.store import Store

class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "test.sqlite3")

    def tearDown(self):
        self.tmp.cleanup()

    def test_task_starts_pending(self):
        task = self.store.create_task("windows_time", "Read Windows date/time")
        self.assertEqual(task["state"], "pending_approval")

    def test_wrong_expected_state_is_rejected(self):
        task = self.store.create_task("windows_time", "Read Windows date/time")
        self.store.transition(task["id"], "pending_approval", "approved")
        with self.assertRaises(ValueError):
            self.store.transition(task["id"], "pending_approval", "running")

    def test_task_creation_is_audited(self):
        task = self.store.create_task("windows_time", "Read Windows date/time")
        events = self.store.audit_events()
        self.assertTrue(any(e["task_id"] == task["id"] and e["event"] == "task_created" for e in events))

if __name__ == "__main__":
    unittest.main()
