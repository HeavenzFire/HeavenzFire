"""Regression and integration tests for the HeavenzFire mesh model-task worker."""
import hashlib
import importlib.util
import json
import os
import sys
import unittest
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
WORKER_PATH = os.path.join(HERE, "worker.py")
_saved_argv = sys.argv[:]
sys.argv = [WORKER_PATH, "18101"]
try:
    spec = importlib.util.spec_from_file_location("hf_worker_under_test", WORKER_PATH)
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
finally:
    sys.argv = _saved_argv


class WorkerTaskTests(unittest.TestCase):
    def test_hash_task_is_deterministic(self):
        result = worker.execute_task({"type": "hash_task", "payload": {"input": "hf-test", "rounds": 2}})
        self.assertEqual(result["task_kind"], "hash_task")
        expected = hashlib.sha256(hashlib.sha256(b"hf-test").digest()).hexdigest()
        self.assertEqual(result["hash"], expected)
        self.assertEqual(len(result["hash"]), 64)
        self.assertEqual(result["rounds"], 2)

    def test_hash_rejects_unbounded_rounds(self):
        with self.assertRaises(ValueError):
            worker.execute_task({"type": "hash_task", "payload": {"input": "x", "rounds": 100001}})

    def test_model_task_rejects_unknown_model(self):
        with self.assertRaises(ValueError):
            worker.execute_task({"type": "model_task", "payload": {"prompt": "hello", "model": "untrusted/model"}})

    def test_model_task_rejects_oversized_prompt(self):
        with self.assertRaises(ValueError):
            worker.execute_task({"type": "model_task", "payload": {"prompt": "x" * 3001}})

    def test_model_task_runs_local_inference(self):
        try:
            with urllib.request.urlopen("http://127.0.0.1:11434/api/tags", timeout=2) as response:
                tags = json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            self.skipTest("Local Ollama unavailable: " + str(exc))
        installed = {item.get("name") for item in tags.get("models", [])}
        if "qwen2.5:0.5b" not in installed:
            self.skipTest("qwen2.5:0.5b is not installed")
        result = worker.execute_task({
            "type": "model_task",
            "payload": {"model": "qwen2.5:0.5b", "prompt": "Reply with exactly HF_MODEL_WORKER_PASS"}
        })
        self.assertEqual(result["task_kind"], "model_task")
        self.assertEqual(result["model"], "qwen2.5:0.5b")
        self.assertTrue(result["response"].strip())
        self.assertGreater(result["response_chars"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)