#!/usr/bin/env python3
"""Evidence-first recursive gyroid/toroid ordering benchmark.

This is a lossless permutation experiment, not a claim that geometry alone
compresses arbitrary data. Every permutation is invertible; each codec output
is decoded and compared byte-for-byte. Reports include the full compressed
payload size, but not the shared Python interpreter/runtime size.
"""
from __future__ import annotations

import argparse
import bz2
import gzip
import hashlib
import json
import lzma
import math
import time
import zlib
from pathlib import Path
from typing import Callable

TAU = 2.0 * math.pi


def _fields(index: int, n: int) -> tuple[float, float, float, float, float, float]:
    side = max(1, math.ceil(n ** (1.0 / 3.0)))
    x = (index % side) / side
    y = ((index // side) % side) / side
    z = (index // (side * side)) / side
    ax, ay, az = TAU * x, TAU * y, TAU * z
    gyroid = (math.sin(ax) * math.cos(ay)
              + math.sin(ay) * math.cos(az)
              + math.sin(az) * math.cos(ax))
    rho = math.sqrt((x - 0.5) ** 2 + (y - 0.5) ** 2)
    toroid = math.sqrt((rho - 0.25) ** 2 + (z - 0.5) ** 2) - 0.12
    phase = math.atan2(gyroid, toroid)
    return x, y, z, gyroid, toroid, phase


def build_orders(n: int) -> dict[str, list[int]]:
    """Return deterministic invertible index permutations, including recursive topology."""
    identity = list(range(n))
    if n < 2:
        return {"direct": identity}

    side = max(1, math.ceil(n ** (1.0 / 3.0)))
    fields = [_fields(i, n) for i in range(n)]
    orders: dict[str, list[int]] = {"direct": identity}

    # Morton/Z-order gives a hierarchical space-filling baseline.
    def spread3(v: int) -> int:
        out = 0
        bit = 0
        while v:
            out |= (v & 1) << (3 * bit)
            v >>= 1
            bit += 1
        return out

    orders["morton"] = sorted(
        identity,
        key=lambda i: (spread3(i % side)
                       | (spread3((i // side) % side) << 1)
                       | (spread3(i // (side * side)) << 2), i),
    )

    # Recursive cell path: at each depth, subdivide the cube into 8 octants.
    # Gyroid/toroid/phase values break ties within a leaf; index is the final tie-break.
    max_depth = max(1, math.ceil(math.log2(side)))
    def recursive_key(i: int, anchor: float) -> tuple:
        x, y, z, g, t, phase = fields[i]
        path = []
        for depth in range(max_depth):
            scale = 2 ** (depth + 1)
            bx = min(scale - 1, int(x * scale))
            by = min(scale - 1, int(y * scale))
            bz = min(scale - 1, int(z * scale))
            path.append((bx & 1) | ((by & 1) << 1) | ((bz & 1) << 2))
        return (tuple(path), abs(g) / 2.0 + abs(t) / 0.5
                + 0.5 * (1.0 - math.cos(phase - anchor)), i)

    for anchor in (0.0, 3.0, 6.0):
        orders[f"recursive_gyroid_toroid_{int(anchor)}"] = sorted(
            identity, key=lambda i: recursive_key(i, anchor)
        )
    return orders


def invert_permutation(data: bytes, order: list[int]) -> bytes:
    if len(data) != len(order) or sorted(order) != list(range(len(data))):
        raise ValueError("Order is not a complete permutation of the payload.")
    restored = bytearray(len(data))
    for encoded_index, original_index in enumerate(order):
        restored[original_index] = data[encoded_index]
    return bytes(restored)


CODECS: dict[str, tuple[Callable[[bytes], bytes], Callable[[bytes], bytes]]] = {
    "bzip2-9": (lambda b: bz2.compress(b, compresslevel=9), bz2.decompress),
    "lzma-9": (lambda b: lzma.compress(b, preset=9), lzma.decompress),
    "gzip-9": (lambda b: gzip.compress(b, compresslevel=9, mtime=0), gzip.decompress),
    "zlib-9": (lambda b: zlib.compress(b, level=9), zlib.decompress),
}


def benchmark(data: bytes) -> dict:
    if not data:
        raise ValueError("Input must not be empty.")
    source_hash = hashlib.sha256(data).hexdigest()
    started = time.perf_counter()
    orders = build_orders(len(data))
    topology_seconds = time.perf_counter() - started
    results = []
    for mode, order in orders.items():
        transformed = bytes(data[i] for i in order)
        for codec, (encode, decode) in CODECS.items():
            packed = encode(transformed)
            decoded = decode(packed)
            restored = decoded if mode == "direct" else invert_permutation(decoded, order)
            exact = restored == data and hashlib.sha256(restored).hexdigest() == source_hash
            if not exact:
                raise RuntimeError(f"Round-trip failed: {mode} + {codec}")
            results.append({
                "topology": mode, "codec": codec, "payload_bytes": len(packed),
                "reduction_percent": round(100 * (1 - len(packed) / len(data)), 3),
                "ratio": round(len(data) / len(packed), 5),
                "round_trip": "PASS", "source_sha256": source_hash,
            })
    results.sort(key=lambda row: (row["payload_bytes"], row["topology"], row["codec"]))
    direct = {r["codec"]: r["payload_bytes"] for r in results if r["topology"] == "direct"}
    for row in results:
        row["vs_same_codec_direct_bytes"] = row["payload_bytes"] - direct[row["codec"]]
    return {
        "schema": "heavenzfire.recursive-topology-benchmark.v1",
        "source_bytes": len(data), "source_sha256": source_hash,
        "topology_generation_seconds": round(topology_seconds, 6),
        "accounting_note": "Payload sizes exclude shared decoder/runtime and source/reference files.",
        "winner": results[0], "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Source bytes to benchmark")
    parser.add_argument("--report", type=Path, help="Optional JSON report path")
    args = parser.parse_args()
    data = args.source.read_bytes()
    report = benchmark(data)
    encoded = json.dumps(report, indent=2)
    print(f"Source: {args.source} ({len(data):,} bytes)")
    print(f"SHA-256: {report['source_sha256']}")
    print(f"Winner: {report['winner']['topology']} + {report['winner']['codec']}")
    print(f"Payload: {report['winner']['payload_bytes']:,} bytes")
    print(f"Reduction: {report['winner']['reduction_percent']:.3f}%")
    print("All candidates: exact byte-for-byte reconstruction PASS")
    print("\nTOPOLOGY                    CODEC       BYTES   VS DIRECT")
    for row in report["results"]:
        print(f"{row['topology']:<27} {row['codec']:<10} {row['payload_bytes']:>8} {row['vs_same_codec_direct_bytes']:>11}")
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(encoded + "\n", encoding="utf-8")
        print(f"Report: {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
