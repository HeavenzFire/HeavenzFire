"""Loopback-only HTTP API and compact browser UI."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from .actions import ACTIONS, run_action
from .store import Store

HOST, PORT = "127.0.0.1", 8765
STORE = Store()

HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>HeavenzFire Unified Operator</title>
<style>
body{font:16px system-ui;max-width:900px;margin:24px auto;padding:0 16px;background:#10151d;color:#e7edf5}
.card{background:#19222e;border:1px solid #344355;border-radius:12px;padding:16px;margin:14px 0}
button,select{font:inherit;padding:9px;border-radius:8px;background:#26374a;color:white;border:1px solid #50657b}
.task{border-top:1px solid #344355;padding:12px 0;overflow-wrap:anywhere}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0b1016;padding:12px;border-radius:8px}
small{color:#a7b5c5}.badge{border:1px solid #61758a;border-radius:20px;padding:2px 8px;font-size:12px}
</style></head><body><h1>HeavenzFire Unified Operator</h1>
<small>Local-first · approval-first · loopback only</small>
<div class="card"><h2>Registered actions</h2><div id="actions">Loading…</div>
<select id="action"></select> <button onclick="createTask()">Request task</button>
<p><small>Tasks do not run until you explicitly approve them.</small></p></div>
<div class="card"><h2>Task ledger</h2><button onclick="refresh()">Refresh</button><div id="tasks"></div></div>
<div class="card"><h2>Audit trail</h2><div id="audit"></div></div>
<script>
async function api(p,o={}){let r=await fetch(p,{headers:{'Content-Type':'application/json'},...o});let d=await r.json();if(!r.ok)throw Error(d.error||r.statusText);return d}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function init(){let a=await api('/api/actions');actions.innerHTML=a.map(x=>'<p><b>'+esc(x.label)+'</b> <span class="badge">'+esc(x.risk)+'</span><br><small>'+esc(x.description)+'</small></p>').join('');action.innerHTML=a.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.label)+'</option>').join('');await refresh()}
async function createTask(){try{await api('/api/tasks',{method:'POST',body:JSON.stringify({action_id:action.value})});await refresh()}catch(e){alert(e.message)}}
async function approve(id){try{await api('/api/tasks/'+id+'/approve',{method:'POST',body:'{}'});await refresh()}catch(e){alert(e.message)}}
async function refresh(){try{let [ts,ev]=await Promise.all([api('/api/tasks'),api('/api/audit')]);tasks.innerHTML=ts.map(t=>'<div class="task"><b>'+esc(t.description)+'</b> <span class="badge">'+esc(t.state)+'</span><br><small>'+esc(t.id)+' · '+esc(t.created_at)+'</small><p>'+(t.state==='pending_approval'?'<button onclick="approve(\''+esc(t.id)+'\')">Approve & run</button>':'')+'</p>'+(t.result?'<pre>'+esc(JSON.stringify(t.result,null,2))+'</pre>':'')+(t.error?'<pre>'+esc(t.error)+'</pre>':'')+'</div>').join('')||'No tasks';audit.innerHTML=ev.map(e=>'<div class="task"><b>'+esc(e.event)+'</b><pre>'+esc(JSON.stringify(e.detail))+'</pre></div>').join('')||'No events'}catch(e){tasks.textContent=e.message}}
init();
</script></body></html>"""

class Handler(BaseHTTPRequestHandler):
    server_version = "HeavenzFireOperator/0.1"
    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))

    def send_json(self, code, value):
        data = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 8192:
            raise ValueError("Request body too large")
        return json.loads(self.rfile.read(length).decode("utf-8") or "{}")

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            data = HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(data)
        elif path == "/health":
            self.send_json(200, {"ok": True, "service": "heavenzfire-unified-operator", "version": "0.1"})
        elif path == "/api/actions":
            self.send_json(200, [{"id": k, **v} for k, v in ACTIONS.items()])
        elif path == "/api/tasks":
            self.send_json(200, STORE.list_tasks())
        elif path == "/api/audit":
            self.send_json(200, STORE.audit_events())
        elif path.startswith("/api/tasks/"):
            task = STORE.get_task(path.rsplit("/", 1)[-1])
            self.send_json(200 if task else 404, task or {"error": "Task not found"})
        else:
            self.send_json(404, {"error": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            body = self.body()
            if path == "/api/tasks":
                action_id = body.get("action_id")
                if action_id not in ACTIONS:
                    return self.send_json(400, {"error": "Unknown action_id"})
                return self.send_json(201, STORE.create_task(action_id, ACTIONS[action_id]["label"]))
            parts = path.strip("/").split("/")
            if len(parts) == 4 and parts[:2] == ["api", "tasks"] and parts[3] == "approve":
                task_id = parts[2]
                task = STORE.get_task(task_id)
                if not task:
                    return self.send_json(404, {"error": "Task not found"})
                if task["state"] != "pending_approval":
                    return self.send_json(409, {"error": "Task is not awaiting approval"})
                STORE.transition(task_id, "pending_approval", "approved")
                STORE.transition(task_id, "approved", "running")
                try:
                    result = run_action(task["action_id"])
                    STORE.transition(task_id, "running", "completed" if result.get("ok") else "failed",
                                     result=result, error=None if result.get("ok") else result.get("error"))
                except Exception as exc:
                    STORE.transition(task_id, "running", "failed", error=type(exc).__name__)
                return self.send_json(200, STORE.get_task(task_id))
            return self.send_json(404, {"error": "Not found"})
        except (ValueError, json.JSONDecodeError) as exc:
            return self.send_json(400, {"error": str(exc)})
        except Exception as exc:
            return self.send_json(500, {"error": "Internal error", "type": type(exc).__name__})

def main():
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print("HeavenzFire Unified Operator listening on http://%s:%s" % (HOST, PORT))
    print("Loopback only. Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        print("Stopped.")

if __name__ == "__main__":
    main()
