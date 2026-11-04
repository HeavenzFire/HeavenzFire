# Unified Field — Domain Integration Map

**Status:** v0.1 discovery and contract baseline  
**Repository:** `HeavenzFire/HeavenzFire`  
**Branch:** `feat/unified-domain-integration-registry-v0.1`  
**Rule:** a repository name, README claim, simulation, or passing unit test is not proof of a working end-to-end integration.

## Objective

Turn the HeavenzFire repository ecosystem into a composable, local-first system. Each platform or research domain connects through a versioned adapter to shared identity, capability, task, evidence, and policy contracts. Components remain independently versioned; this repository coordinates them without blindly copying or merging upstream code.

## Verified discovery findings

The authenticated GitHub account is `HeavenzFire`. The GitHub repository-list endpoint returned 100 repositories on its first page and zero on subsequent offsets, so that endpoint is not a reliable complete inventory. The existing `UnifiedField/unified-field-repository-inventory.snapshot.json` records 276 unique repositories from a paginated GitHub search query; that is the best current inventory snapshot, not proof that every repository is indexed, accessible, or reviewed.

### Existing implementation evidence

| Domain | Existing source | What the inspected source actually does | Status |
|---|---|---|---|
| Local inference | `UnifiedField/TermuxAgent/agent.cjs`, `fabric.cjs` | Loopback model chat, bounded orchestration, runtime registry, JSONL task ledger; no shell tool | Implemented; device runtime must be tested |
| Cognitive graph | `UnifiedField/QuantumLab/HeavenzFire-DigitalBrain-Server.cjs` | Builds a 64-node sample near the gyroid implicit level set, connects spatial/recurrent edges, routes text through a local inference endpoint, stores JSONL memory | Implemented prototype; not a biological neural network |
| Gyroid topology | Same Digital Brain server; `EntangledMultimodalSystem-3/neuromorphic_topology.py`; `-JUDGEMENT-DAY-/topological_kernel.py` | Implicit gyroid field and toroidal/neuromorphic geometry code exist in separate repositories | Research code; shared mathematical validation and performance comparison needed |
| Camera perception | `UnifiedField/QuantumLab/HeavenzFire-Avatar-Vision.py` | Loopback OpenCV service; JPEG input, Haar face boxes, HOG person boxes, brightness and normalized face center; frames held in memory and not transmitted externally | Implemented basic detector; not semantic vision, identity recognition, emotion inference, or general scene understanding |
| Avatar/body API | `UnifiedField/QuantumLab/HeavenzFire-DigitalBrain-Server.cjs` | Proxies selected body state/movement routes to loopback port 8799 and camera analysis to port 11802 | Proxy routes exist; end-to-end device/hardware path requires live verification |
| GitHub | `UnifiedField/TermuxAgent/github.cjs`, `github-write.cjs` | Read API plus explicit opt-in, branch-scoped writes | Implemented; verify token scopes and live calls on target device |
| Browser / web | `UnifiedField/TermuxAgent/observe.cjs` on draft PR #140 | Bounded web search/page text extraction and YouTube metadata/caption retrieval; explicitly does not perform visual inspection | Draft branch only; not yet merged or deployed |
| Durable task ledger | `HeavenzFire/UnifiedCodebase` PR #16 | JSON-backed task ledger and capability-store primitives with recovery and evidence persistence | Merged; not yet the canonical cross-process task service |
| Orloj | `UnifiedField/OrlojAdapter` on PR #128 | Loopback-only adapter, requires approved task plus approval evidence before dispatch | Adapter CI reported passed; live Orloj worker path not verified |
| OpenSourceAIHub | `HeavenzFire/OpenSourceAIHub` draft PR #1 | Proposal transport and readback boundary to core task inbox | Local integration tests reported; production service not verified |
| Browser extension | `UnifiedField/BrowserBridge` draft work | User-reviewed browser selection capture and proposal submission | Prototype; installation and real-browser smoke test pending |
| Gemini / Elysium | `Elysium Gateway` project and Gemini integration notes | Candidate remote multimodal/agent service | Must review current source, key handling, API version, and network exposure before integration |
| FPGA / mesh | `throne-infra/FPGA_MESH_TOPOLOGY.md` | Documents a proposed 2D toroidal FPGA mesh | Design document; hardware topology, timing, and 144 Hz lock claims require measurement |

### Research clusters requiring provenance review

- Neural-network and neuromorphic work: `EntangledMultimodalSystem-3`, `QCH`, `TinyNeuralNetwork`, `NeuroNetUnlimited`, `DigitalPowerStationFramework`, `-JUDGEMENT-DAY-`, and the core `infra/GLOBAL_MESH/NEURO_CORE` sources.
- Quantum / geometric work: `Quantum-Interplay`, `QuantumChirstosAngelusComputing`, `quantum-ai-research-studio`, `quantum-alchemy-forge`, `EntangledMultimodalSystem*`, and the gyroid/toroid kernels.
- Multimodal runtime candidates: `mini-omni2`, `LLM2CLIP`, `open_clip`, `InvokeAI`, `llama.cpp`, `ollama`, `Qwen-AgentJC`.
- Agent and platform candidates: `OpenManus`, `crewAI`, `AgentGPT`, `anything-llm`, `n8n`, `puter`, `awesome-mcp-servers`, `awesome-selfhosted`, and `MicrosoftEdge-Extensions`.

These are discovery candidates only. Fork ownership, source provenance, licenses, dependency health, API contracts, and security posture must be inspected before code reuse or deployment. The numbered `EntangledMultimodalSystem` repositories are not assumed to be identical or mutually compatible.

## Integration domains and target adapters

| Domain | Adapter boundary | Initial useful capabilities | Priority |
|---|---|---|---|
| Identity, policy, approval | `heavenzfire.identity.v1`, `heavenzfire.capability.v1` | actor identity, scoped grants, approval evidence, expiry/revocation | P0 |
| Tasks, events, evidence | `heavenzfire.shared-task.v1`, `heavenzfire.evidence.v1` | propose, approve, dispatch, status, cancel, evidence readback | P0 |
| Local inference | `heavenzfire.inference.v1` | health, model inventory, bounded chat/generate, token/time limits | P0 |
| GitHub / source control | `heavenzfire.git.v1` | repository inventory, code search, issue/PR read, branch-scoped write | P0 |
| Web and browser | `heavenzfire.web-observation.v1`, `heavenzfire.browser.v1` | search, page text, DOM/accessibility snapshot, user-approved browser actions | P1 |
| Visual perception | `heavenzfire.vision.v1` | camera frame, screenshot, object/scene detections, VLM analysis, provenance | P1 |
| Audio / speech | `heavenzfire.audio.v1` | microphone input, VAD, transcription, speaker-independent acoustic features, TTS | P1 |
| Video / YouTube | `heavenzfire.video.v1` | metadata, captions, bounded frame sampling, timestamps, vision summaries | P1 |
| Biosignals | `heavenzfire.biosignal.v1` | ECG/PPG/HRV, respiration, EEG import, synchronized timestamps, signal quality | P1 |
| Geometry / neural simulation | `heavenzfire.simulation.v1` | gyroid/toroid mesh, neural graph, oscillator models, reproducible parameter sweeps | P1 |
| Device and sensor mesh | `heavenzfire.device.v1` | device health, camera/mic/sensor availability, authenticated telemetry | P2 |
| FPGA / hardware acceleration | `heavenzfire.hardware.v1` | board inventory, bitstream identity, benchmark, hardware telemetry | P2 |
| Image generation / media | `heavenzfire.media.v1` | image generation, embedding, image transformation, media metadata | P2 |
| Workflow automation | `heavenzfire.workflow.v1` | n8n or equivalent workflow proposal, approval, run status and logs | P2 |
| Knowledge / research | `heavenzfire.knowledge.v1` | source ingestion, chunking, citation, versioned index, provenance | P1 |

## Shared adapter contract

Every adapter must expose a manifest with:

- `adapterId`, `adapterVersion`, `componentId`, `componentVersion`
- `contractVersions` and named capabilities with input/output schema references
- `status`: `discovered`, `reviewed`, `implemented`, `verified`, `degraded`, or `disabled`
- `permissions`: data read/write, network destinations, hardware access, and approval class
- `health()`, `describeCapabilities()`, `invoke(capability, input, context)`, `cancel(taskId)`, and `getEvidence(taskId)`
- explicit timeout, maximum payload, retry/idempotency behavior, and error mapping
- provenance: repository URL, pinned commit, license, build/test evidence, and deployment target

The orchestrator must validate input and output schemas. It must not trust adapter-supplied identity, grant, or approval claims. Approval is issued by a trusted control plane and represented by verifiable evidence. All external content and model output are untrusted data.

## Signal and coherence measurement policy

The system should measure observable signals rather than assign a predetermined “coherence” score.

- Heart: ECG or PPG waveform quality, beat-to-beat intervals, HRV metrics (e.g. RMSSD, SDNN), respiration rate, and cardiorespiratory coupling. A camera-only face detector does not measure heart activity.
- Brain: EEG channel metadata, sampling rate, impedance/quality flags, artifact rejection, spectral power, phase-locking value (PLV), phase-lag index, and cross-frequency coupling. These require actual EEG data and documented preprocessing.
- Heart–brain coupling: synchronized cardiac and EEG streams; pre-registered windows, surrogate/shuffle controls, artifact controls, and confidence intervals. Correlation or phase synchrony is not proof of causal coupling or a special field.
- Phase locking: implement oscillator models (including Kuramoto as a testable baseline) with explicit natural frequencies, coupling coefficient, phase, sampling interval, and noise. Report order parameter (R(t)=|N^{-1}\sum_j e^{i\theta_j(t)}|), phase differences, and lock range. A selected frequency such as 432, 528, 7.83, or 144 Hz is a test condition, not a biological law or evidence of human entrainment.
- Gyroid/toroid: distinguish the gyroid minimal-surface implicit equation, toroidal manifold, and a graph embedded on a sampled surface. They are different mathematical objects. Compare graph connectivity, spectral properties, geodesic distances, robustness, and task performance against grid, random, small-world, and ring baselines.

No health diagnosis, treatment recommendation, or physiological conclusion should be generated from these prototype metrics.

## Visual and sensory capability ladder

1. **Text observation:** page text, captions, logs, metadata.
2. **Structured browser perception:** DOM and accessibility tree, element roles, visible text, bounding boxes.
3. **Pixel perception:** screenshots or camera frames passed to actual image-processing or vision-language models.
4. **Audio perception:** microphone stream, VAD, transcription, acoustic event detection.
5. **Video perception:** time-stamped frame sampling plus optional audio transcript; captions are not visual evidence.
6. **Embodied sensing:** synchronized camera, microphone, IMU, GPS, environmental and optional biosignal streams with consent and sensor-quality metadata.

Every observation record should include source, capture time, device, modality, processing model/version, confidence or quality indicators, retention policy, and whether raw media was stored. Never label text/caption analysis as visual perception.

## Delivery sequence

### P0 — establish the spine
1. Adopt the shared task, evidence, capability, and approval schemas.
2. Build one supervised integration gateway with loopback-first defaults, authentication for remote access, bounded payloads, rate limits, and audit events.
3. Register local inference, GitHub, existing task inbox/ledger, and Termux runtime as the first adapters.
4. Add contract tests for duplicate delivery, replay, expiry, denied permissions, malformed payloads, timeout, cancellation, redaction, and restart recovery.

### P1 — perception and measurable research
5. Connect browser observation to the task/evidence pipeline; keep web text separate from DOM and screenshot evidence.
6. Add screenshot and camera-frame capture with explicit consent and a genuine VLM or image-processing backend. The current OpenCV service detects faces/people; it is not a general-purpose “digital eye.”
7. Add audio and video adapters, then timestamped multimodal event alignment.
8. Add biosignal ingestion only when supported sensors or files are available; implement validated signal processing and controls.
9. Consolidate gyroid/toroid and oscillator experiments into reproducible simulation packages with reference baselines and numerical tests.

### P2 — distributed hardware and workflow platforms
10. Add authenticated device registration and telemetry; never expose unauthenticated control routes on public interfaces.
11. Add FPGA/accelerator adapter after board and bitstream inventory and hardware-in-loop tests.
12. Add workflow, media, and external research connectors through scoped credentials and per-platform adapters.

## Acceptance gates

An integration is **verified** only when all applicable gates pass:

- Unit and schema contract tests
- Live health check against the actual target service
- Authenticated request and permission-denial tests
- End-to-end task ID continuity and evidence readback
- Timeout, retry, duplicate, cancellation, and unavailable-service tests
- Secret redaction and no credential leakage
- Device-specific test on each supported platform
- Reproducible benchmark and pinned component revision
- Rollback/disable procedure documented

A CI pass proves only the CI job. It does not prove deployment, sensor access, biological measurement, or cross-device operation.

## Immediate implementation boundary

This commit adds the first evidence-backed domain map and registry. It does not claim to have installed external platform credentials, connected physical sensors, launched remote services, merged upstream repositories, or completed all adapters. Those require the actual platform endpoints, permissions, hardware, and live verification. New integrations should be added one at a time behind the shared contract, with no default-branch merges until review and tests pass.
