import tempfile
import unittest
from pathlib import Path

from unified_field.task_ledger import TaskLedger


class FakeClock:
    def __init__(self): self.now = 100.0
    def __call__(self): return self.now


class TaskLedgerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.clock = FakeClock()
        self.ledger = TaskLedger(Path(self.tmp.name) / 'tasks.sqlite3', clock=self.clock)

    def tearDown(self):
        self.ledger.close()
        self.tmp.cleanup()

    def test_enqueue_is_idempotent_for_same_content(self):
        a = self.ledger.enqueue('test', {'x': 1}, idempotency_key='same')
        b = self.ledger.enqueue('test', {'x': 1}, idempotency_key='same')
        self.assertEqual(a, b)
        with self.assertRaises(ValueError):
            self.ledger.enqueue('test', {'x': 2}, idempotency_key='same')

    def test_claim_finish_and_counts(self):
        task_id = self.ledger.enqueue('build', {'target': 'tests'})
        task = self.ledger.claim('worker-a', lease_seconds=10)
        self.assertEqual(task['task_id'], task_id)
        self.assertEqual(task['state'], 'running')
        self.ledger.finish(task_id, 'worker-a', result={'ok': True})
        self.assertEqual(self.ledger.get(task_id)['state'], 'succeeded')
        self.assertEqual(self.ledger.counts()['succeeded'], 1)

    def test_expired_lease_returns_task_to_queue(self):
        task_id = self.ledger.enqueue('work', {})
        self.ledger.claim('worker-a', lease_seconds=5)
        self.clock.now += 6
        task = self.ledger.claim('worker-b', lease_seconds=5)
        self.assertEqual(task['task_id'], task_id)
        self.assertEqual(task['attempts'], 2)
        with self.assertRaises(ValueError):
            self.ledger.finish(task_id, 'worker-a', result='stale worker')

    def test_failure_can_retry_or_be_terminal(self):
        task_id = self.ledger.enqueue('work', {})
        self.ledger.claim('worker-a')
        self.ledger.fail(task_id, 'worker-a', 'temporary', retry=True)
        self.assertEqual(self.ledger.get(task_id)['state'], 'pending')
        self.ledger.claim('worker-b')
        self.ledger.fail(task_id, 'worker-b', 'permanent', retry=False)
        self.assertEqual(self.ledger.get(task_id)['state'], 'failed')

    def test_rejects_non_json_payload(self):
        with self.assertRaises(ValueError):
            self.ledger.enqueue('work', {'nan': float('nan')})

    def test_ledger_persists_across_reopen(self):
        task_id = self.ledger.enqueue('persist', {'v': 7})
        self.ledger.close()
        self.ledger = TaskLedger(Path(self.tmp.name) / 'tasks.sqlite3', clock=self.clock)
        self.assertEqual(self.ledger.get(task_id)['payload'], {'v': 7})


if __name__ == '__main__':
    unittest.main()
