# Initial Repository Content Audit — 2026-10-22

**Scope:** 12 README probes across the first consolidation candidates. This is a bounded content triage, not a full code/security audit.

## Findings backed by fetched README content

### A. Repeated AI Studio starter template — consolidate by evidence, not by name
The following repositories' README files contain the same generated starter text and the same GitHub banner image reference, while pointing to different Google AI Studio app IDs:

| Repository | README blob SHA | Observed README signature |
|---|---|---|
| [HeavenzFire-Core-System-1](https://github.com/HeavenzFire/HeavenzFire-Core-System-1) | `7d0704bf38b4570d57201efdd72c29ea8e0fe2fe` | “Run and deploy your AI Studio app”; Node.js; `npm install`; `GEMINI_API_KEY`; `npm run dev`; app ID `1boxRIXq11x69WniqrPGOPbPbnp-vo_9-` |
| [Sovereign-Node-](https://github.com/HeavenzFire/Sovereign-Node-) | `19e68b26e63d918bd491a78aaa5cc71b9a8d4169` | Same template; app ID `3e685e52-7e27-4d65-80a2-36b9ec0f4b93` |
| [Syntropic-Kernel-Code-Explore](https://github.com/HeavenzFire/Syntropic-Kernel-Code-Explore) | `1869a298c52d90701a267ccb2b71776584e4dbff` | Same template; app ID `1zxAnylZkWviC0Ev3Slv3SGvXMyJb__fp` |
| [HeavenzFire-Sovereign-Node](https://github.com/HeavenzFire/HeavenzFire-Sovereign-Node) | `9859f3e4641bf931cae9a0cb68d70b89d9082467` | Same template; app ID `1ThVly6VslN3bQARflZ_4_W7dEG8XhXqN` |
| [HeavenzFire-Omni-Substrate-Node](https://github.com/HeavenzFire/HeavenzFire-Omni-Substrate-Node) | `fb9911e1f1da915f6784e34de8fed69a3ecbf2cb` | Same template; app ID `1LuUzdtfKogBuq4pYR8CbOVSZ7IHAdCtJ` |
| [GuardianOS-Dashboard](https://github.com/HeavenzFire/GuardianOS-Dashboard) | `da7651e297f4abc7a6e778490e722f7ae9a991d5` | Same template; app ID `1Th6Sf39N86GU3OfY99iPi5f9UfdnLzWC` |

**Assessment:** These six are strong *README-template duplicate candidates*, not yet proven code duplicates. Next compare file trees, package manifests, source hashes, and app-specific code. Keep distinct app IDs and all source repositories intact until the comparison establishes what is shared and what is unique. Do not merge or delete based on README similarity alone.

### B. Repositories with distinct documented purpose

- [IBEN-Genesis](https://github.com/HeavenzFire/IBEN-Genesis), README blob `d87f40af22a8a76f86a35c9a5a6ea98e4e6b91a5`: documents a sovereign JavaScript runtime / parallel-perspective reasoning, links operating principles and gyroid pipeline notes, and explicitly cautions against overclaiming evidence. Candidate for a core-runtime/research workstream.
- [Neural-Swarm-Orchestrator](https://github.com/HeavenzFire/Neural-Swarm-Orchestrator), README blob `9c0bc190419416a27d8437578a53edf32253c907`: documents orchestration, retry/telemetry, and an explicit human-in-the-loop deployment lifecycle. Treat architecture and production claims as README claims until implementation, tests, workflows, and recent commits are verified.
- [SpiritAngelusFramework](https://github.com/HeavenzFire/SpiritAngelusFramework), README blob `399ac9b2f1539e087cf629e93e1d88b1bcb56739`: documents the cross-AI handoff JSON schema, standard-library validator, tests, and explicit limits on platform adapters. Candidate for portable interchange contract ownership.
- [Spirit_Engine](https://github.com/HeavenzFire/Spirit_Engine), README blob `34973726a042161ed10bd56b3bdcc5756e5f571d`: documents a recovery fabric with allowlisted inventory, snapshots, SHA-256 verification, staged restore, and tests. Candidate for backup/recovery ownership; implementation/tests still require verification.
- [spirit-angelus](https://github.com/HeavenzFire/spirit-angelus), README blob `f56747a18e5d04325740467fdbb23a457b68dddd`: README uses strong symbolic claims but supplies little concrete implementation evidence in the inspected excerpt. Keep classification unverified pending source/test inspection.
- [UnifiedCodebase](https://github.com/HeavenzFire/UnifiedCodebase): fetching `README.md` returned HTTP 404. This means no README was available at that path on the queried default branch; it does not prove the repository is empty.

## Recommended next audit order

1. Compare the six AI Studio starter candidates by recursive file tree, `package.json`, lockfile, source file hashes, workflows, and AI Studio project-specific differences.
2. Inspect tests and workflows for `Spirit_Engine`, `SpiritAngelusFramework`, `IBEN-Genesis`, and `Neural-Swarm-Orchestrator`.
3. Identify canonical responsibility boundaries: portable handoff/interchange; recovery/backup; agent orchestration; UI/dashboard; runtime/research.
4. Record exact source commit SHAs before any migration. Use pull requests and retain all source repositories and history.

## Limits

No source code was copied, merged, deleted, archived, renamed, or pushed into any source project as part of this audit. README content alone is not proof of code equivalence, functional behavior, security, or test status.


## Addendum — package manifest comparison

Package manifests were also fetched for the six README-template candidates:

| Repository | package.json blob SHA | Scripts / stack observed |
|---|---|---|
| `HeavenzFire-Core-System-1` | `5eb7bf8ebdcda25327a4ba175af7f77257df197e` | Vite build/preview; React; `@google/genai`, Recharts, Lucide |
| `Sovereign-Node-` | `2a16f85eda145f565d207dc019637abc99a061fa` | Express + WebSocket server, `tsx` test/lint scripts, React/Vite, Google GenAI and OpenAI SDK |
| `Syntropic-Kernel-Code-Explore` | `99c038f15a26c3f8275705c89d075ed83dc780a8` | Vite build/preview; React with minimal declared dependencies |
| `HeavenzFire-Sovereign-Node` | `18a857fc4a888feeae39830b781fbf554bee8a05` | Vite build/preview; React; `@google/genai`, Recharts, Lucide |
| `HeavenzFire-Omni-Substrate-Node` | `4ca15694be15d55e38a52fa2bd3bb599b6718354` | Vite build/preview; React; Google GenAI and Recharts |
| `GuardianOS-Dashboard` | `59be2d0e6b01cdfc4ea19c9a3e6771d92f71f287` | Vite build/preview; React; Google GenAI and Lucide |

**Updated assessment:** the common README is a generated template reused across separate app repositories. Package manifests show meaningful differences, especially `Sovereign-Node-`, which declares an Express/WebSocket server and tests. Do not treat these six as interchangeable codebases. The next decisive step is a recursive tree and content-hash comparison, followed by source/build/test review of each app's unique code.
