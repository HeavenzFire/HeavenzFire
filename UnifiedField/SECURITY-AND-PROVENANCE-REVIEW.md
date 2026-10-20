# Unified Field: Security and Provenance Review

**Observed:** 2026-10-20  
**Scope:** Selected repositories inspected as an initial code-level review. This is not a full audit of all 276 indexed repositories.

## High-priority findings

### Elysium-Gateway — client-side provider key exposure risk

Evidence: `vite.config.ts` sets the Vite dev host to `0.0.0.0` and defines both `process.env.API_KEY` and `process.env.GEMINI_API_KEY`; `services/geminiService.ts` instantiates `GoogleGenAI` in frontend code using `process.env.API_KEY`.

Impact: a real provider key supplied at build time may be embedded in browser-served JavaScript, where users can inspect it. The dev server also listens on all interfaces by default. This is a configuration/code risk; this review does **not** establish that a live key was exposed or abused.

Required remediation before public deployment:
1. Move Gemini calls behind a server-side API route; never define provider secrets into frontend bundles.
2. Default the development server to `127.0.0.1`.
3. Add request-size limits, rate limiting, origin controls, and redacted error handling on the server route.
4. Rotate any real key that may already have been shipped in a public bundle.

### Sovereign-Node- — network exposure and simulation/provenance concerns

Evidence: `server.ts` binds Express/WebSocket to `0.0.0.0:3000`; inspected routes include `POST /seal`, `GET /api/vault`, `POST /api/trinary/decide`, and WebSocket `START_ENGINE` / `STOP_ENGINE` messages, with no authentication middleware visible in the inspected server code. `/api/mesh/nodes` returns hard-coded sample nodes. `src/lib/syntropic-engine.ts` calls a pass “Grover-based optimization” but computes `delta_s` using `Math.random()`. `src/lib/model-advisors.ts` sends a literal `Authorization: Bearer EMPTY` to local OpenAI-compatible endpoints.

Required remediation before network exposure:
1. Bind to loopback by default and do not enable LAN/public binding without authentication and explicit configuration.
2. Add schema validation, body limits, request timeouts, and authorization to mutation and WebSocket controls.
3. Label mesh nodes as simulated fixtures and the engine as a simulation unless real implementations and benchmarks are added.
4. Replace the placeholder bearer value with a deliberate local authentication design or remove the misleading header.

## Integration candidate

### Spirit_Engine — local recovery fabric

The README and inspected code describe allowlist-based snapshots, SHA-256 verification, secret/cache exclusions, no source deletion, and no overwrite of live projects. Its Python tests cover exclusions and tamper/path-traversal behavior. The README explicitly says real cloud bucket upload and complete end-to-end restore are not yet validated.

Recommended role: a future `recovery.plan` / `recovery.verify` capability that is plan-only by default. Any restore or cloud upload remains a separate, explicitly approved action.

## Provenance and evidence limitations

- `MicrosoftEdge-Extensions` describes itself as the Microsoft Edge community sample/issues/discussion repository; its inspected root package is generic and its root `manifest.json` was not found. Do not treat it as a finished custom HeavenzFire extension.
- `Qwen-AgentJC` README links QwenLM/Qwen-Agent resources; fork provenance, license, and compatibility still require verification.
- `Syntropic-Kernel-Code-Explore` is described as an AI Studio app; its inspected package exposes Vite scripts without a dedicated backend or test script.
- `The-Pantheon-of-Neural-Intelligence-` has no root README at the inspected default branch; package metadata indicates a Vite/Express/WebSocket server prototype, but routes remain unreviewed.
- `HEAVENZFIRE-ECOSYSTEM-AUDIT` README claims 256+ repositories and links root inventory/map files that returned 404 during this inspection. Its completeness/production claims remain unverified until the artifacts are reconciled.
- `EntangledMultimodalSystem` README presents speculative consciousness/quantum claims without reproducible validation in the inspected root document. Keep these claims marked as hypotheses, not scientific findings.

## Current inventory status

The paginated GitHub search query `user:HeavenzFire` returned 276 unique repository results (100, 100, 76, then 0; no duplicates). This is complete for that query result set, not proof that every account repository is indexed or accessible. All 276 repositories still require source, license, provenance, and interface review.
