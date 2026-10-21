# -*- coding: utf-8 -*-
"""Loopback-only, bounded dashboard bridge to the authenticated mesh coordinator."""
import hmac
import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HOST = "127.0.0.1"
PORT = int(os.environ.get("HEAVENZFIRE_BRIDGE_PORT", "8081"))
COORDINATOR = os.environ.get("HEAVENZFIRE_COORDINATOR", "http://127.0.0.1:8080")
TOKEN = os.environ.get("HEAVENZFIRE_TOKEN", "")

def upstream(path, data=None):
    if not TOKEN:
        raise RuntimeError("mesh token unavailable")
    raw = None if data is None else json.dumps(data, separators=(",", ":")).encode("utf-8")
    headers = {"Authorization": "Bearer " + TOKEN, "Accept": "application/json"}
    if raw is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(COORDINATOR + path, data=raw, headers=headers)
    with urllib.request.urlopen(req, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))

def send(h, status, data):
    raw = json.dumps(data, separators=(",", ":")).encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Cache-Control", "no-store")
    h.send_header("X-Content-Type-Options", "nosniff")
    h.send_header("Content-Length", str(len(raw)))
    h.end_headers()
    h.wfile.write(raw)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(fmt % args, flush=True)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            return send(self, 200, {"ok": True, "service": "heavenzfire-mesh-dashboard-bridge",
                                    "host": HOST, "port": PORT, "token_loaded": bool(TOKEN)})
        if parsed.path == "/api/mesh/task":
            task_id = parse_qs(parsed.query).get("task_id", [""])[0]
            if not task_id or len(task_id) > 100:
                return send(self, 400, {"ok": False, "error": "valid task_id required"})
            try:
                return send(self, 200, upstream("/task?task_id=" + task_id))
            except urllib.error.HTTPError as e:
                return send(self, e.code, {"ok": False, "error": "coordinator rejected task lookup"})
            except Exception:
                return send(self, 502, {"ok": False, "error": "coordinator unavailable"})
        return send(self, 404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if urlparse(self.path).path != "/api/mesh/enqueue":
            return send(self, 404, {"ok": False, "error": "not found"})
        origin = self.headers.get("Origin", "")
        if origin and origin not in ("http://127.0.0.1:8800", "http://localhost:8800"):
            return send(self, 403, {"ok": False, "error": "origin denied"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 2 or length > 8192:
                return send(self, 413, {"ok": False, "error": "request must be 2-8192 bytes"})
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(data, dict):
                raise ValueError("JSON object required")
            task_type = data.get("type")
            payload = data.get("payload", {})
            if task_type == "hash_task":
                if not isinstance(payload, dict) or not isinstance(payload.get("input", ""), str):
                    raise ValueError("hash_task payload.input must be text")
                if len(payload.get("input", "")) > 2000:
                    raise ValueError("input too long (max 2000 characters)")
                rounds = payload.get("rounds", 1)
                if isinstance(rounds, bool) or not isinstance(rounds, int) or not 1 <= rounds <= 100000:
                    raise ValueError("rounds must be an integer from 1 to 100000")
                payload = {"input": payload.get("input", ""), "rounds": rounds}
            elif task_type == "model_task":
                if not isinstance(payload, dict) or not isinstance(payload.get("prompt"), str):
                    raise ValueError("model_task requires a prompt")
                if not 1 <= len(payload["prompt"].strip()) <= 3000:
                    raise ValueError("prompt must contain 1-3000 characters")
                model = payload.get("model", "llama3.2:1b")
                allowed = {"qwen2.5:0.5b", "llama3.2:1b", "heavenzfire:latest", "heavenzfire-runtime:latest"}
                if model not in allowed:
                    raise ValueError("model is not in the local allowlist")
                payload = {"prompt": payload["prompt"], "model": model}
            else:
                raise ValueError("unsupported task type; use hash_task or model_task")
            return send(self, 200, upstream("/enqueue", {"type": task_type, "payload": payload}))
        except ValueError as e:
            return send(self, 400, {"ok": False, "error": str(e)})
        except urllib.error.HTTPError:
            return send(self, 502, {"ok": False, "error": "coordinator rejected enqueue"})
        except Exception:
            return send(self, 502, {"ok": False, "error": "coordinator unavailable"})

if not TOKEN:
    raise SystemExit("HEAVENZFIRE_TOKEN is required; refusing to start bridge")
print("Dashboard bridge on %s:%s" % (HOST, PORT), flush=True)
ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()