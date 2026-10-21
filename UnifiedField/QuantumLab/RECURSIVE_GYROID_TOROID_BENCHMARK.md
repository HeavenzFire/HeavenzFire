# Recursive Gyroid/Toroid Ordering Benchmark

Status: experimental; **not adopted as a compression default**.

## Reproduction

Run with Python 3.12+:

```powershell
Set-Location 'C:\Users\rucke\HeavenzFire\UnifiedField\QuantumLab'
python -m unittest test_recursive_gyroid_toroid_benchmark -v
python .\recursive_gyroid_toroid_benchmark.py 'C:\Users\rucke\heavenzfire-capsule-v02\gyroid-compression-lab\benchmark.json' --report '.\recursive_gyroid_toroid_results.json'
```

## Measured result on the local Windows machine

- Input: 47,488 bytes
- Input SHA-256: `db51be78726fafdd2fa8a6f7b37dd0fe31df03e8cc58a9aa4caa270f8523231a`
- Direct bzip2-9: 8,197 bytes (82.739% reduction)
- Morton + bzip2-9: 14,562 bytes (+6,365 bytes versus direct)
- Recursive gyroid/toroid ordering + bzip2-9: 16,863 bytes (+8,666 bytes versus direct)
- All tested candidates reconstructed the original input byte-for-byte; four unit tests passed.

## Interpretation and limits

The recursive ordering is lossless because it permutes bytes and reverses the permutation after decompression. On this sample, however, the ordering **hurts** general-purpose compression compared with the direct baseline. The three phase anchors produced identical sizes on this input. This is a negative but useful result: do not wire this permutation into the production codec until it demonstrates a repeatable net win across representative datasets, with permutation metadata and decoder/runtime overhead included in total-size accounting.

The report's compressed payload sizes exclude the Python runtime and decoder. This is a benchmark prototype, not proof of universal compression gains or a production HFQ codec.
