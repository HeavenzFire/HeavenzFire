#!/usr/bin/env python3
"""HeavenzFire local-only redundant observer. No control-plane mutations."""
from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
import shutil
import socket
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ENDPOINTS = {
    "dashboard": "http://127.0.0.1:8800/health",
    "gateway": "http://127.0.0.1:8787/health",
    "orchestrator": "http://127.0.0.1:8788/health",
    "agent": "http://127.0.0.1:8790/health",
    "ollama": "http://127.0.0.1:11434/api/tags",
    "senses": "http://127.0.0.1:8794/health",
    "discovery": "http://127.0.0.1:8795/health",
    "browser_bridge": "http://127.0.0.1:18795/health",
    "mesh_coordinator": "http://127.0.0.1:8080/health",
}
ZERO_HASH = "0" * 64


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def canonical(obj: Any) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def chain_hash(previous: str, payload: dict[str, Any]) -> str:
    return hashlib.sha256(previous.encode("ascii") + b"\n" + canonical(payload)).hexdigest()


def verify_journal(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"exists": False, "valid": True, "records": 0, "head": ZERO_HASH}
    previous = ZERO_HASH
    records = 0
    try:
        with path.open("r", encoding="utf-8") as stream:
            for line_number, line in enumerate(stream, 1):
                if not line.strip():
                    continue
                row = json.loads(line)
                payload = row["payload"]
                stored_previous = row["previous_hash"]
                stored_hash = row["record_hash"]
                expected = chain_hash(stored_previous, payload)
                if stored_previous != previous or stored_hash != expected:
                    return {
                        "exists": True, "valid": False, "records": records,
                        "head": previous, "bad_line": line_number,
                    }
                previous = stored_hash
                records += 1
        return {"exists": True, "valid": True, "records": records, "head": previous}
    except Exception as exc:
        return {
            "exists": True, "valid": False, "records": records,
            "head": previous, "error": type(exc).__name__,
        }


def append_record(path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    prior = verify_journal(path)
    if not prior["valid"]:
        raise RuntimeError(f"journal integrity check failed: {path.name}")
    previous = prior["head"]
    record_hash = chain_hash(previous, payload)
    row = {"previous_hash": previous, "payload": payload, "record_hash": record_hash}
    encoded = canonical(row) + b"\n"
    with path.open("ab") as stream:
        stream.write(encoded)
        stream.flush()
        os.fsync(stream.fileno())
    return {"record_hash": record_hash, "records": prior["records"] + 1}


def probe_endpoint(url: str, timeout: float = 1.5) -> dict[str, Any]:
    started = time.monotonic()
    request = urllib.request.Request(url, headers={"User-Agent": "HeavenzFire-Watchtower/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            response.read(128)
            return {
                "reachable": True, "status": int(response.status),
                "latency_ms": round((time.monotonic() - started) * 1000, 1),
            }
    except urllib.error.HTTPError as exc:
        return {
            "reachable": True, "status": int(exc.code),
            "latency_ms": round((time.monotonic() - started) * 1000, 1),
        }
    except Exception as exc:
        return {
            "reachable": False, "error": type(exc).__name__,
            "latency_ms": round((time.monotonic() - started) * 1000, 1),
        }


def memory_status() -> dict[str, Any]:
    if os.name == "nt":
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]
        state = MEMORYSTATUSEX()
        state.dwLength = ctypes.sizeof(state)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(state)):
            return {
                "total_gb": round(state.ullTotalPhys / (1024 ** 3), 2),
                "available_gb": round(state.ullAvailPhys / (1024 ** 3), 2),
                "load_percent": int(state.dwMemoryLoad),
            }
    return {"available": False}


def snapshot_resources() -> dict[str, Any]:
    result: dict[str, Any] = {"memory": memory_status()}
    try:
        disk = shutil.disk_usage(os.environ.get("SystemDrive", "C:") + "\\")
        free_gb = round(disk.free / (1024 ** 3), 2)
        result["system_drive"] = {"free_gb": free_gb, "total_gb": round(disk.total / (1024 ** 3), 2)}
        result["alerts"] = []
        if free_gb < 8:
            result["alerts"].append("DISK_CRITICAL_LT_8_GB")
        elif free_gb < 15:
            result["alerts"].append("DISK_WARNING_LT_15_GB")
        available = result["memory"].get("available_gb")
        if available is not None:
            if available < 0.5:
                result["alerts"].append("MEMORY_CRITICAL_LT_0_5_GB")
            elif available < 1.0:
                result["alerts"].append("MEMORY_WARNING_LT_1_GB")
    except Exception as exc:
        result["disk_error"] = type(exc).__name__
    return result


def tcp_probe(port: int, timeout: float = 0.6) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


def run_once(role: str, data_dir: Path) -> dict[str, Any]:
    path = data_dir / f"watchtower-{role}.jsonl"
    payload: dict[str, Any] = {
        "timestamp": utc_now(),
        "observer": role,
        "mode": "observe-only",
        "host": os.environ.get("COMPUTERNAME", "unknown"),
    }
    if role == "health":
        payload["services"] = {name: probe_endpoint(url) for name, url in DEFAULT_ENDPOINTS.items()}
        payload["unreachable"] = [
            name for name, result in payload["services"].items() if not result["reachable"]
        ]
    else:
        health_path = data_dir / "watchtower-health.jsonl"
        integrity_path = data_dir / "watchtower-integrity.jsonl"
        payload["journals"] = {
            "health": verify_journal(health_path),
            "integrity": verify_journal(integrity_path),
        }
        payload["resources"] = snapshot_resources()
        ports = {8787, 8788, 8790, 8794, 8795, 8800, 11434, 18795, 8080}
        payload["loopback_ports"] = {str(port): tcp_probe(port) for port in sorted(ports)}
        payload["integrity_alerts"] = [
            f"JOURNAL_INVALID:{name}" for name, state in payload["journals"].items()
            if not state["valid"]
        ]
        payload["integrity_alerts"].extend(payload["resources"].get("alerts", []))
    result = append_record(path, payload)
    return {"observer": role, "journal": str(path), **result, "payload": payload}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--role", choices=("health", "integrity"), required=True)
    parser.add_argument("--data-dir", default=os.path.join(
        os.environ.get("LOCALAPPDATA", str(Path.home())), "HeavenzFire", "Watchtower"))
    parser.add_argument("--interval", type=int, default=30)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    data_dir = Path(args.data_dir)
    while True:
        try:
            result = run_once(args.role, data_dir)
            print(json.dumps(result, ensure_ascii=False), flush=True)
        except Exception as exc:
            print(json.dumps({
                "timestamp": utc_now(), "observer": args.role,
                "fatal": type(exc).__name__, "mode": "observe-only",
            }), flush=True)
            return 2
        if args.once:
            return 0
        time.sleep(max(5, args.interval))


if __name__ == "__main__":
    raise SystemExit(main())
