# HeavenzFire Unified Field — Embodied Avatar Integration

This source set joins the existing local dashboard, Digital Brain, camera-perception worker, and bounded mesh bridge. It is intended to be launched from the creator's Windows workspace, not as a static hosted page.

## Service graph

- Dashboard UI/API: `http://127.0.0.1:8800/`
- Digital Brain UI/API: `http://127.0.0.1:8797/`
- Avatar Body state/movement API: `http://127.0.0.1:8799/`
- Local inference gateway: `http://127.0.0.1:11800/v1`
- Local OpenCV perception: `http://127.0.0.1:11802/health`
- Bounded mesh bridge: `http://127.0.0.1:8081/health`
- Existing HeavenzFire Tesla voice/chat service: `http://127.0.0.1:8796/health`

The dashboard embeds the Digital Brain page. The brain's chat calls the shared local inference gateway and writes bounded observations to its local memory. The browser avatar's movement and perception updates also pass through the Digital Brain's same-origin `/api/body/*` proxy into the Avatar Body service. The service records a bounded simulated pose and event history; the dashboard and brain therefore share one body-state source rather than maintaining an unrelated canvas-only position. The avatar's optional camera path requests browser permission, captures low-resolution JPEG frames, and sends them to the same-origin brain proxy `/api/vision/analyze`; the brain forwards them only to the loopback OpenCV worker. The vision worker returns face/person boxes and brightness metrics. Raw frames are processed in memory and are not stored.

## Start on Windows PowerShell 5.1

From the workspace:

```powershell
& "$env:USERPROFILE\HeavenzFire\UnifiedField\QuantumLab\Start-UnifiedFieldDashboard.ps1"
```

The launcher starts/checks the mesh bridge, Digital Brain, OpenCV vision worker, and dashboard, then opens the dashboard. It does not change firewall rules or bind services to external interfaces.

## Voice boundary

Digital Brain chat replies currently use browser speech synthesis when spoken replies are enabled; speech recognition is browser/platform-dependent. The existing Tesla voice service on port 8796 is a local chat/research endpoint and its current UI also uses browser speech synthesis. Neither fact proves that a personalized voice model exists. A trained voice model built from the creator's own authorized recordings is **not yet configured**, and this repository must not label a generic OS voice as the creator's voice.

## Camera troubleshooting

The backend can be checked without a physical camera:

```powershell
Invoke-RestMethod http://127.0.0.1:8797/api/vision/health
& 'C:\Python312\python.exe' "$env:USERPROFILE\HeavenzFire\UnifiedField\QuantumLab\Test-HeavenzFire-Avatar-Vision.py"
```

The synthetic-frame test proves the local analysis path works; it does not prove that Windows exposes a physical camera or that Chrome has permission. If the browser reports `NotFoundError`, Windows is not exposing an available camera device to that browser. Check Device Manager, the physical shutter/function key, camera driver, Windows camera privacy settings, and Chrome site permission. `NotAllowedError` indicates permission denial; `NotReadableError` generally means the device is busy or unavailable.

## Current capability limits

- Avatar rendering is a detailed animated 2D canvas character, not a 3D rig.
- Perception currently covers face/person detection, brightness, and frame-to-frame motion; it is not general semantic vision.
- Movement is UI-level avatar motion, mirrored into the Avatar Body's simulated pose; it is not physical robot actuation.
- Voice cloning and personalized synthesis remain unconfigured until a local model is trained/installed and evaluated.

## Verification

Run the following from PowerShell:

```powershell
node --check .\UnifiedField\QuantumLab\HeavenzFire-DigitalBrain-Server.cjs
node --check .\UnifiedField\QuantumLab\UnifiedField-Dashboard-Server.cjs
node --test .\UnifiedField\QuantumLab\unified-field-dashboard.test.cjs
node --test .\UnifiedField\QuantumLab\worker-forge.test.cjs
node --test .\UnifiedField\QuantumLab\worker-result-store.test.cjs
& 'C:\Python312\python.exe' .\UnifiedField\QuantumLab\Test-HeavenzFire-Avatar-Vision.py
```
