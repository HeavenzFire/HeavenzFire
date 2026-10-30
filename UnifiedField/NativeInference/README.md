# HeavenzFire Native Inference Engine (HF-NIE)

Version: 0.1.0 — native compute foundation.

HF-NIE is an independently developed C++17 execution substrate for the HeavenzFire Unified Field. The initial target is Android ARM64 / Termux. This directory is intentionally separate from the existing Node.js orchestration fabric.

## Current implementation

- Checked, contiguous FP32 tensor storage with a configurable per-tensor allocation ceiling.
- CPU matrix multiplication.
- RMS normalization.
- Numerically stable softmax.
- Greedy argmax token-selection primitive.
- Shape, finite-value, and allocation-limit validation.
- Dependency-free CMake build and deterministic self-test.

## Explicit limitations

This release is **not yet a language-model inference runtime**. It does not load model weights, implement a tokenizer, execute transformer layers, expose an HTTP server, or claim GGUF compatibility. Those are subsequent milestones. The existing Termux fabric remains unchanged and continues to require a separately running compatible inference service.

## Build on Termux

Install only the build tools if they are not already present:

```sh
pkg install cmake make
```

Build and test:

```sh
cd "$HOME/HeavenzFire-src/UnifiedField/NativeInference"
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j2
ctest --test-dir build --output-on-failure
./build/hf-nie --version
```

The first build validates the native compiler and compute substrate. It does not download a model or consume model-sized memory.

## Resource policy

The initial tensor allocation ceiling is 64 MiB per tensor, not a promise that the device has 64 MiB free. Before adding model loading or KV caching, the runtime must account for process memory, available system RAM, model weight size, context length, and cache growth. Concurrency must be benchmarked on-device rather than inferred from the fabric's configured maximum.

## Roadmap

1. Native tensor and scalar-kernel tests (this release).
2. Model manifest, binary reader, and tokenizer interface.
3. Decoder-only transformer execution with explicit memory budgeting.
4. Quantized weight support and GGUF import compatibility.
5. Loopback HTTP inference service compatible with the existing Termux agent.
6. Fabric registration, end-to-end Android smoke tests, and measured performance.

## Security

Model files and prompts are untrusted input. The engine has no shell execution, network access, or automatic code-modification capability. The future HTTP service must bind to loopback by default and enforce bounded request sizes, context limits, and memory limits.
