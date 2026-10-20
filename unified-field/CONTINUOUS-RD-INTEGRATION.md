# HeavenzFire Continuous R&D — UnifiedField Integration

This extends the existing UnifiedField; it is not a second orchestrator.

## Components reused

- FieldCore: four engineering lanes, synthesis, persisted reports and report verification.
- BrowserBridge: user-confirmed local task ingress; loopback-only by default.
- PropagationFabric: versioned envelopes and modality registry.
- BraidedPipeline: bounded dependency DAG, handshake/replay checks and hash-chained trace.
- SovereigntyLab: heuristic redaction and injection checks; not complete security controls.
- capsule-v02/rd-pipeline: research queue, workers, source retrieval and telemetry.
- Ollama at 127.0.0.1:11434: local model runtime, checked live before inference.

## Continuous loop

OBSERVE -> TEST -> RESEARCH (opt-in) -> VERIFY -> REPORT -> REVIEW -> NEXT CYCLE

The runner records acceptance tests, Ollama health, live health snapshots for Gateway, Orchestrator, ToolService, Agent, MemoryService, EcosystemHub, UniversalAPI, MeshCoordinator and BrowserBridge, research status, queue counts and resource telemetry. Every cycle writes uniquely timestamped report and test-log artifacts so later runs do not overwrite earlier evidence. Model inference is opt-in with -ResearchGoal. It never automatically adopts generated code or deletes files.

## Run in PowerShell 5.1

One bounded cycle without model inference:

    & "$env:USERPROFILE\HeavenzFire\UnifiedField\Invoke-HeavenzFireContinuousRD.ps1"

One cycle with local-model research:

    & "$env:USERPROFILE\HeavenzFire\UnifiedField\Invoke-HeavenzFireContinuousRD.ps1" -ResearchGoal "Propose the next integration improvement"

Repeat every 30 seconds until Ctrl+C:

    & "$env:USERPROFILE\HeavenzFire\UnifiedField\Invoke-HeavenzFireContinuousRD.ps1" -Continuous -ResearchGoal "Investigate one measurable improvement to UnifiedField"

Reports and test logs go to UnifiedField/FieldCore/reports/continuous-rd/.

## Safety and limits

- No public listener, firewall rule, startup task, hidden persistence or credential changes are created.
- Never place API keys, plaintext DPAPI tokens, private data or secrets in research prompts or reports.
- Passing tests does not prove every deployed service is running.
- Ollama reachability does not prove model answer quality; findings require evidence and review.
- Research queue approval is not proof of safe deployment.
- Add explicit adapters and health checks for external providers or cross-device nodes; never claim connected before end-to-end verification.
