# UnifiedField Continuous R&D

This is the integration entrypoint for HeavenzFire's existing local-first UnifiedField and the separate capsule R&D queue. It adds a bounded, evidence-first cycle runner rather than a parallel orchestrator.

- [Integration architecture and runbook](CONTINUOUS-RD-INTEGRATION.md)
- [Integration manifest](continuous-rd-manifest.json)
- [PowerShell 5.1 cycle runner](Invoke-HeavenzFireContinuousRD.ps1)

## Verified locally

- UnifiedField core acceptance suite: 21 tests passed.
- PowerShell parser: passed.
- One bounded R&D cycle completed successfully.
- Local Ollama endpoint responded and returned the installed model list.
- All nine configured local service health endpoints returned healthy during the follow-up sweep.
- Each cycle now records local service health and uses unique timestamped artifacts.
- The cycle wrote a JSON report and test log under FieldCore/reports/continuous-rd/.

Model inference is opt-in. The runner does not automatically adopt generated changes, delete files, create startup persistence, or expose local services to the network.
