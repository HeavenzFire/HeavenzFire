# -*- coding: utf-8 -*-
"""Authenticated HeavenzFire mesh worker for hash_task jobs (Python 3.12+ stdlib only)."""
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 18101
COORDINATOR = os.environ.get("HEAVENZFIRE_COORDINATOR", "http://127.0.0.1:8080")
TOKEN = os.environ.get("HEAVENZFIRE_TOKEN", "")
WORKER_ID = "hf-worker-" + str(PORT)

def request_json(path, data=None, timeout=5):
    if not TOKEN:
        raise RuntimeError("HEAVENZFIRE_TOKEN is not set; refusing unauthenticated task polling")
    body = None if data is None else json.dumps(data, separators=(",", ":")).encode("utf-8")
    headers = {"Authorization": "Bearer " + TOKEN, "Accept": "application/json"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(COORDINATOR + path, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))

def execute_task(task):
    task_type = task.get("type")
    payload = task.get("payload") or {}
    if task_type == "hash_task":
        value = payload.get("input", "")
        if not isinstance(value, str):
            raise ValueError("hash_task payload.input must be a string")
        rounds = payload.get("rounds", 1)
        if isinstance(rounds, bool) or not isinstance(rounds, int) or not 1 <= rounds <= 100000:
            raise ValueError("hash_task rounds must be an integer from 1 to 100000")
        digest = hashlib.sha256(value.encode("utf-8")).digest()
        for _ in range(rounds - 1):
            digest = hashlib.sha256(digest).digest()
        return {"task_kind": "hash_task", "hash": digest.hex(), "rounds": rounds, "input_length": len(value)}

    if task_type == "model_task":
        prompt = payload.get("prompt", "")
        model = payload.get("model", "qwen2.5:0.5b")
        allowed_models = {"qwen2.5:0.5b", "llama3.2:1b", "heavenzfire:latest", "heavenzfire-runtime:latest"}
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 3000:
            raise ValueError("model_task prompt must contain 1-3000 characters")
        if model not in allowed_models:
            raise ValueError("Requested model is not in the local allowlist")
        body = json.dumps({
            "model": model,
            "prompt": "You are a HeavenzFire engineering worker. Be concise, evidence-oriented, and explicit about uncertainty. Do not claim actions you did not perform.\\n\\nTask:\\n" + prompt,
            "stream": False,
            "options": {"temperature": 0.2, "num_predict": 180}
        }).encode("utf-8")
        req = urllib.request.Request(
            "http://127.0.0.1:11434/api/generate",
            data=body,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=90) as response:
            data = json.loads(response.read().decode("utf-8"))
        text = data.get("response", "")
        if not isinstance(text, str) or not text.strip():
            raise RuntimeError("Local model returned an empty response")
        return {
            "task_kind": "model_task",
            "model": model,
            "worker_id": WORKER_ID,
            "response": text[:5000],
            "response_chars": len(text),
            "done": bool(data.get("done", False))
        }

    raise ValueError("Unsupported task type: " + str(task_type))

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            raw = json.dumps({"ok": True, "service": "heavenzfire-mesh-worker", "worker_id": WORKER_ID, "port": PORT, "authenticated": bool(TOKEN)}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        else:
            self.send_error(404)
    def log_message(self, fmt, *args):
        # Keep routine polling quiet; record errors and task completions only.
        msg = fmt % args
        if '"GET /health' in msg:
            return
        print("[%s] %s" % (WORKER_ID, msg), flush=True)

def worker_loop():
    if not TOKEN:
        raise SystemExit("HEAVENZFIRE_TOKEN is not set; worker will not start")
    print("Worker %s polling authenticated coordinator %s" % (WORKER_ID, COORDINATOR), flush=True)
    while True:
        try:
            response = request_json("/poll", {"worker_id": WORKER_ID}, timeout=10)
            task = response.get("task")
            if not task:
                time.sleep(0.4)
                continue
            task_id = task.get("task_id")
            try:
                result = execute_task(task)
                completed = request_json("/complete", {"task_id": task_id, "worker_id": WORKER_ID, "result": result}, timeout=10)
                print("Task %s completed (%s)" % (task_id, completed.get("status", "unknown")), flush=True)
            except Exception as exc:
                try:
                    result = request_json("/complete", {"task_id": task_id, "worker_id": WORKER_ID, "error": str(exc)}, timeout=10)
                    print("Task %s failed (%s): %s" % (task_id, result.get("status", "unknown"), exc), flush=True)
                except Exception as report_exc:
                    print("Could not report task %s failure: %s" % (task_id, report_exc), flush=True)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            print("Coordinator request error: %s" % exc, flush=True)
            time.sleep(1.5)

if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    import threading
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        worker_loop()
    finally:
        server.shutdown()
        server.server_close()