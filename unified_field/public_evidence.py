'''Bounded, cache-first retrieval of public research/API evidence.

This module treats web responses as data, never as executable instructions. It
uses a strict HTTPS host allowlist, blocks redirects, caps response bytes, and
persists exact response bytes plus SHA-256 for offline inspection/replay.
'''
from __future__ import annotations

import hashlib
import json
import sqlite3
import ssl
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.parse import urlsplit

ALLOWED_HOSTS = frozenset({
    'eutils.ncbi.nlm.nih.gov',
    'api.github.com',
    'www.ebi.ac.uk',
})
DEFAULT_MAX_BYTES = 2_000_000


@dataclass(frozen=True)
class EvidenceRecord:
    url: str
    body: bytes
    sha256: str
    retrieved_at: float
    status: int
    content_type: str | None
    etag: str | None
    from_cache: bool


class EvidenceError(RuntimeError):
    pass


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class PublicEvidenceCache:
    """Allowlisted HTTPS evidence cache; caller chooses cache-first/offline mode."""

    def __init__(self, path: str | Path, *, clock: Callable[[], float] = time.time,
                 max_bytes: int = DEFAULT_MAX_BYTES, timeout: float = 8.0) -> None:
        if isinstance(max_bytes, bool) or not isinstance(max_bytes, int) or max_bytes < 1:
            raise ValueError('max_bytes must be a positive integer')
        if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or timeout <= 0:
            raise ValueError('timeout must be positive')
        self.path = str(path)
        self.clock = clock
        self.max_bytes = max_bytes
        self.timeout = float(timeout)
        self.db = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('''CREATE TABLE IF NOT EXISTS evidence (
            url TEXT PRIMARY KEY, body BLOB NOT NULL, sha256 TEXT NOT NULL,
            retrieved_at REAL NOT NULL, status INTEGER NOT NULL,
            content_type TEXT, etag TEXT)''')

    def close(self) -> None:
        self.db.close()

    @staticmethod
    def validate_url(url: str) -> None:
        try:
            parsed = urlsplit(url)
            host = (parsed.hostname or '').lower().rstrip('.')
            port = parsed.port
        except ValueError as exc:
            raise EvidenceError('malformed URL') from exc
        if parsed.scheme != 'https' or host not in ALLOWED_HOSTS or parsed.username or parsed.password:
            raise EvidenceError('URL must use HTTPS and an explicitly allowlisted public host')
        if port not in (None, 443) or not parsed.path.startswith('/'):
            raise EvidenceError('nonstandard ports are not allowed')
        if parsed.fragment:
            raise EvidenceError('URL fragments are not accepted')

    def get(self, url: str, *, offline: bool = False) -> EvidenceRecord:
        self.validate_url(url)
        row = self.db.execute('SELECT url,body,sha256,retrieved_at,status,content_type,etag FROM evidence WHERE url=?', (url,)).fetchone()
        if offline:
            if row is None:
                raise EvidenceError('offline cache miss; no network request was attempted')
            return self._record(row, True)

        headers = {'User-Agent': 'HeavenzFire-PublicEvidenceCache/0.1', 'Accept': 'application/json, application/xml, text/plain, */*'}
        if row and row[6]:
            headers['If-None-Match'] = row[6]
        request = urllib.request.Request(url, headers=headers, method='GET')
        opener = urllib.request.build_opener(_NoRedirect, urllib.request.HTTPSHandler(context=ssl.create_default_context()))
        try:
            with opener.open(request, timeout=self.timeout) as response:
                status = int(response.status)
                content_type = response.headers.get('Content-Type')
                etag = response.headers.get('ETag')
                body = response.read(self.max_bytes + 1)
        except urllib.error.HTTPError as exc:
            if exc.code == 304 and row:
                return self._record(row, True)
            if exc.code in (301, 302, 303, 307, 308):
                raise EvidenceError('redirect refused; validate the destination separately before requesting it') from exc
            raise EvidenceError(f'public source returned HTTP {exc.code}') from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            if row:
                return self._record(row, True)
            raise EvidenceError('network retrieval failed and no cached copy exists') from exc
        if len(body) > self.max_bytes:
            raise EvidenceError(f'response exceeds configured {self.max_bytes}-byte limit')
        if not 200 <= status < 300:
            raise EvidenceError(f'unexpected HTTP status {status}')
        digest = hashlib.sha256(body).hexdigest()
        now = float(self.clock())
        self.db.execute('INSERT INTO evidence(url,body,sha256,retrieved_at,status,content_type,etag) VALUES(?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET body=excluded.body,sha256=excluded.sha256,retrieved_at=excluded.retrieved_at,status=excluded.status,content_type=excluded.content_type,etag=excluded.etag',
                        (url, sqlite3.Binary(body), digest, now, status, content_type, etag))
        return EvidenceRecord(url, body, digest, now, status, content_type, etag, False)

    def inventory(self) -> list[dict[str, object]]:
        rows = self.db.execute('SELECT url,sha256,retrieved_at,status,length(body) FROM evidence ORDER BY url').fetchall()
        return [{'url': r[0], 'sha256': r[1], 'retrieved_at': r[2], 'status': r[3], 'bytes': r[4]} for r in rows]

    @staticmethod
    def _record(row, from_cache: bool) -> EvidenceRecord:
        body = bytes(row[1])
        digest = hashlib.sha256(body).hexdigest()
        if digest != row[2]:
            raise EvidenceError('cached evidence digest mismatch; record is quarantined')
        return EvidenceRecord(row[0], body, digest, float(row[3]), int(row[4]), row[5], row[6], from_cache)
