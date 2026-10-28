'''SQLite-backed local task ledger for offline-first Unified Field workflows.

This module stores task intent locally so network loss does not erase pending work.
It does not execute task payloads; an orchestrator must validate and dispatch them.
'''
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any


class TaskLedger:
    """Durable queue with idempotency keys and explicit terminal outcomes."""

    def __init__(self, path: str | Path, *, clock=time.time) -> None:
        self.path = str(path)
        self._clock = clock
        self._db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        self._db.execute('PRAGMA journal_mode=WAL')
        self._db.execute('PRAGMA synchronous=FULL')
        self._db.execute('PRAGMA busy_timeout=10000')
        self._db.execute('''CREATE TABLE IF NOT EXISTS tasks (
            task_id TEXT PRIMARY KEY,
            idempotency_key TEXT NOT NULL UNIQUE,
            task_type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            state TEXT NOT NULL CHECK(state IN ('pending','running','succeeded','failed')),
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            lease_owner TEXT,
            lease_until REAL,
            result_json TEXT,
            error TEXT
        )''')
        self._db.execute('CREATE INDEX IF NOT EXISTS tasks_state_created ON tasks(state, created_at)')

    def close(self) -> None:
        self._db.close()

    def enqueue(self, task_type: str, payload: Any, *, idempotency_key: str | None = None) -> str:
        if not isinstance(task_type, str) or not task_type.strip():
            raise ValueError('task_type must be a non-empty string')
        key = idempotency_key or str(uuid.uuid4())
        if not isinstance(key, str) or not key.strip():
            raise ValueError('idempotency_key must be a non-empty string')
        try:
            payload_json = json.dumps(payload, sort_keys=True, separators=(',', ':'), allow_nan=False)
        except (TypeError, ValueError) as exc:
            raise ValueError('payload must be finite JSON-compatible data') from exc
        now = float(self._clock())
        task_id = str(uuid.uuid4())
        try:
            self._db.execute('INSERT INTO tasks(task_id,idempotency_key,task_type,payload_json,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
                             (task_id, key, task_type, payload_json, 'pending', now, now))
            return task_id
        except sqlite3.IntegrityError:
            row = self._db.execute('SELECT task_id,task_type,payload_json FROM tasks WHERE idempotency_key=?', (key,)).fetchone()
            if row is None:
                raise
            if row['task_type'] != task_type or row['payload_json'] != payload_json:
                raise ValueError('idempotency key already exists with different task content')
            return str(row['task_id'])

    def claim(self, worker_id: str, *, lease_seconds: float = 60.0) -> dict[str, Any] | None:
        if not isinstance(worker_id, str) or not worker_id.strip():
            raise ValueError('worker_id must be a non-empty string')
        if isinstance(lease_seconds, bool) or not isinstance(lease_seconds, (int, float)) or lease_seconds <= 0:
            raise ValueError('lease_seconds must be positive')
        now = float(self._clock())
        self._db.execute('BEGIN IMMEDIATE')
        try:
            # Expired leases are recoverable; running work may be retried after a crash.
            self._db.execute("UPDATE tasks SET state='pending',lease_owner=NULL,lease_until=NULL,updated_at=? WHERE state='running' AND lease_until<=?", (now, now))
            row = self._db.execute("SELECT * FROM tasks WHERE state='pending' ORDER BY created_at,task_id LIMIT 1").fetchone()
            if row is None:
                self._db.execute('COMMIT')
                return None
            until = now + float(lease_seconds)
            self._db.execute("UPDATE tasks SET state='running',attempts=attempts+1,lease_owner=?,lease_until=?,updated_at=? WHERE task_id=? AND state='pending'", (worker_id, until, now, row['task_id']))
            claimed = self._db.execute('SELECT * FROM tasks WHERE task_id=?', (row['task_id'],)).fetchone()
            self._db.execute('COMMIT')
            return self._decode(claimed)
        except Exception:
            self._db.execute('ROLLBACK')
            raise

    def finish(self, task_id: str, worker_id: str, *, result: Any = None) -> None:
        result_json = json.dumps(result, sort_keys=True, separators=(',', ':'), allow_nan=False)
        now = float(self._clock())
        cur = self._db.execute("UPDATE tasks SET state='succeeded',result_json=?,error=NULL,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE task_id=? AND state='running' AND lease_owner=? AND lease_until>?", (result_json, now, task_id, worker_id, now))
        if cur.rowcount != 1:
            raise ValueError('task not owned by worker, lease expired, or task is not running')

    def fail(self, task_id: str, worker_id: str, error: str, *, retry: bool = True) -> None:
        if not isinstance(error, str):
            raise TypeError('error must be a string')
        now = float(self._clock())
        state = 'pending' if retry else 'failed'
        cur = self._db.execute('UPDATE tasks SET state=?,error=?,lease_owner=NULL,lease_until=NULL,updated_at=? WHERE task_id=? AND state=\'running\' AND lease_owner=? AND lease_until>?', (state, error[:2000], now, task_id, worker_id, now))
        if cur.rowcount != 1:
            raise ValueError('task not owned by worker, lease expired, or task is not running')

    def get(self, task_id: str) -> dict[str, Any] | None:
        row = self._db.execute('SELECT * FROM tasks WHERE task_id=?', (task_id,)).fetchone()
        return self._decode(row) if row else None

    def counts(self) -> dict[str, int]:
        counts = {state: 0 for state in ('pending','running','succeeded','failed')}
        for row in self._db.execute('SELECT state,COUNT(*) AS n FROM tasks GROUP BY state'):
            counts[row['state']] = row['n']
        return counts

    @staticmethod
    def _decode(row: sqlite3.Row) -> dict[str, Any]:
        out = dict(row)
        out['payload'] = json.loads(out.pop('payload_json'))
        if out['result_json'] is not None:
            out['result'] = json.loads(out['result_json'])
        out.pop('result_json')
        return out
