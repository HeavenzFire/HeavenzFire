# Harmonic Null-Space Interface (HNSI) 0.1.0

A local-first HeavenzFire signal laboratory with an optional Java WebSocket bridge named **Trip Archalien**.

## Run the frontend

Open `index.html` in a modern browser. The signal simulator runs without a server, package installation, CDN, or network access.

## Run Trip Archalien

Requires a JDK (tested with Java 23; Java 17+ is recommended). In PowerShell, from this directory:

```powershell
Set-Location .\server
.\Start-TripArchalien.ps1
```

Then select **Connect Trip Archalien** in the frontend.

The service binds exclusively to `127.0.0.1:8082`. Port 8080 was already occupied by an existing HeavenzFire coordinator, so this component deliberately uses a separate port and does not stop or alter that process.

Health check: `http://127.0.0.1:8082/health`

## Protocol

- Browser sends `HNSI_UPDATE` with `targetRms`, `residualRms`, and `attenuationDb`.
- Java validates the message type, numeric fields, finiteness, and allowed ranges.
- Trip Archalien returns `HNSI_STATE` with the validated metrics and a bounded simulation score.
- Invalid metrics return an `ERROR` response.
- The server has no shell, filesystem, arbitrary command, or remote-control endpoint.

The score is `clamp(1 - residualRms / targetRms, 0, 1)` (or zero if target RMS is effectively zero). It is a coined indicator of residual reduction in this synthetic signal model, not a biological or medical metric.

## Verification performed

- Java compilation passed with the installed JDK.
- Node integration test passed: HTTP health response, RFC 6455 WebSocket handshake, valid metrics round-trip, expected score calculation, and rejection of negative RMS.
- Headless Chromium test passed: initial render, five runtime integrity checks, live browser-to-Java bridge connection, score display, and frontend interaction; no browser page errors.
- Ideal pure-tone case (phase 180 degrees, equal gain, no noise, no harmonic) produced displayed residual RMS of 0.0000 and all five runtime checks passed.

## Scientific and safety boundary

This is a mathematical signal simulation. It does not detect, diagnose, prevent, or treat cancer or any other disease. The original schematic's biological, terahertz-treatment, ribosomal-clock, and malignancy-cancellation claims are not established by this implementation. Destructive interference in an ideal signal model is not evidence of selective biological effects or clinical benefit.

The direct DFT is educational and computationally expensive for large sample sets. This is not a real-time instrumentation or therapeutic system.

## Files

- `index.html` — interactive simulator and optional WebSocket client.
- `server/TripArchalienServer.java` — dependency-free loopback WebSocket server.
- `server/Start-TripArchalien.ps1` — compile-and-run launcher.
- `server/bridge-verify.cjs` — server protocol and input validation test (Node.js 22+).

[executed on device: ZDH (77b98796-cf81-45a3-96ca-7c08c8e2b595)]