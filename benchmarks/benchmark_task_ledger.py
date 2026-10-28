#!/usr/bin/env python3
"""Measure local SQLite task-ledger throughput across worker counts.

This is a synthetic process-worker benchmark, not an AI-model or target-device
benchmark. It reports raw timings and verifies every task reached success.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import sys

# Running a script by path puts its directory, not the repository root, on sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from unified_field.task_ledger import TaskLedger


def _consume_worker(db_path: str, worker_number: int) -> int:
    local = TaskLedger(db_path)
    completed = 0
    try:
        while True:
            task = local.claim(f'worker-{worker_number}', lease_seconds=600)
            if task is None:
                break
            payload = task['payload']
            digest = str(payload['seed']).encode('utf-8')
            for _ in range(int(payload['iterations'])):
                digest = hashlib.sha256(digest).digest()
            local.finish(task['task_id'], f'worker-{worker_number}', result={'digest': digest.hex()})
            completed += 1
        return completed
    finally:
        local.close()


def run_case(task_count: int, iterations: int, workers: int) -> dict[str, float | int]:
    with tempfile.TemporaryDirectory(prefix='uf-ledger-bench-') as temp_dir:
        db_path = str(Path(temp_dir) / 'bench.sqlite3')
        ledger = TaskLedger(db_path)
        for i in range(task_count):
            ledger.enqueue('hash-benchmark', {'seed': i, 'iterations': iterations}, idempotency_key=f'task-{i}')
        ledger.close()
        started = time.perf_counter()
        with ProcessPoolExecutor(max_workers=workers) as pool:
            counts = list(pool.map(_consume_worker, [db_path] * workers, range(workers)))
        elapsed = time.perf_counter() - started
        check = TaskLedger(db_path)
        try:
            states = check.counts()
        finally:
            check.close()
        if sum(counts) != task_count or states['succeeded'] != task_count or states['pending'] or states['running'] or states['failed']:
            raise RuntimeError(f'incomplete benchmark: workers={counts}, states={states}, expected={task_count}')
        return {'workers': workers, 'tasks': task_count, 'iterations_per_task': iterations,
                'elapsed_seconds': round(elapsed, 6), 'tasks_per_second': round(task_count / elapsed, 3)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--tasks', type=int, default=96)
    parser.add_argument('--iterations', type=int, default=50000)
    args = parser.parse_args()
    if args.tasks < 16 or args.iterations < 1:
        parser.error('--tasks must be >=16 and --iterations must be >=1')
    results = [run_case(args.tasks, args.iterations, workers) for workers in (1, 2, 4, 8, 16)]
    baseline = results[0]['tasks_per_second']
    for item in results:
        item['relative_throughput_vs_1_worker'] = round(item['tasks_per_second'] / baseline, 3) if baseline else None
    print(json.dumps({'benchmark': 'sqlite-task-ledger-plus-sha256-process-workers', 'note': 'synthetic GitHub runner measurement; not target-device or AI-model throughput', 'results': results}, indent=2))


if __name__ == '__main__':
    main()
