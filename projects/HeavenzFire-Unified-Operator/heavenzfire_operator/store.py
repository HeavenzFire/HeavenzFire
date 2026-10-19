"""SQLite task ledger with explicit, auditable state transitions."""
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

STATES = {"pending_approval", "approved", "running", "completed", "failed"}

def utcnow():
    return datetime.now(timezone.utc).isoformat()

class Store:
    def __init__(self, path=None):
        self.path = Path(path or (Path.home() / ".heavenzfire_operator" / "tasks.sqlite3"))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _connect(self):
        con = sqlite3.connect(str(self.path), timeout=5)
        con.row_factory = sqlite3.Row
        return con

    def _init(self):
        with self._connect() as con:
            con.execute("""CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY, action_id TEXT NOT NULL, description TEXT NOT NULL,
                state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                result_json TEXT, error TEXT
            )""")
            con.execute("""CREATE TABLE IF NOT EXISTS audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT,
                event TEXT NOT NULL, detail_json TEXT NOT NULL, created_at TEXT NOT NULL
            )""")

    def _audit(self, con, task_id, event, detail):
        con.execute("INSERT INTO audit(task_id,event,detail_json,created_at) VALUES(?,?,?,?)",
                    (task_id, event, json.dumps(detail, ensure_ascii=False), utcnow()))

    def create_task(self, action_id, description):
        task_id, now = str(uuid.uuid4()), utcnow()
        with self._connect() as con:
            con.execute("INSERT INTO tasks(id,action_id,description,state,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                        (task_id, action_id, description[:500], "pending_approval", now, now))
            self._audit(con, task_id, "task_created", {"action_id": action_id})
        return self.get_task(task_id)

    def transition(self, task_id, expected_state, new_state, result=None, error=None):
        if new_state not in STATES:
            raise ValueError("Invalid task state")
        with self._connect() as con:
            cur = con.execute(
                "UPDATE tasks SET state=?,updated_at=?,result_json=?,error=? WHERE id=? AND state=?",
                (new_state, utcnow(), json.dumps(result, ensure_ascii=False) if result is not None else None,
                 error, task_id, expected_state))
            if cur.rowcount != 1:
                raise ValueError("Task not found or state transition rejected")
            self._audit(con, task_id, "state_changed",
                        {"from": expected_state, "to": new_state, "has_result": result is not None})
        return self.get_task(task_id)

    def get_task(self, task_id):
        with self._connect() as con:
            row = con.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        return self._row(row) if row else None

    def list_tasks(self, limit=50):
        with self._connect() as con:
            rows = con.execute("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?",
                               (min(max(int(limit), 1), 100),)).fetchall()
        return [self._row(row) for row in rows]

    def audit_events(self, limit=100):
        with self._connect() as con:
            rows = con.execute("SELECT * FROM audit ORDER BY id DESC LIMIT ?",
                               (min(max(int(limit), 1), 200),)).fetchall()
        return [{"id": r["id"], "task_id": r["task_id"], "event": r["event"],
                 "detail": json.loads(r["detail_json"]), "created_at": r["created_at"]} for r in rows]

    @staticmethod
    def _row(row):
        if row is None:
            return None
        return {"id": row["id"], "action_id": row["action_id"], "description": row["description"],
                "state": row["state"], "created_at": row["created_at"], "updated_at": row["updated_at"],
                "result": json.loads(row["result_json"]) if row["result_json"] else None,
                "error": row["error"]}
