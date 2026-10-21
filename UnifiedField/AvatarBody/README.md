# HeavenzFire Avatar Body — first implementation

Executable body subsystem for the Unified Field: bounded 3D pose, structured perception ingestion, timestamped observation history, event stream, and loopback HTTP API.

## Start (Windows PowerShell 5.1)

Run `node .\UnifiedField\AvatarBody\avatar-body-server.cjs` from the repository root. Default health endpoint: `http://127.0.0.1:8799/health`.

If 8799 is occupied, set `$env:HEAVENZFIRE_AVATAR_BODY_PORT = '18879'` before launch.

## API

- `GET /health` — service identity and physical-actuation flag.
- `GET /api/state` — pose, sensor status, motion sequence, safety bounds.
- `GET /api/events?after=0` — bounded event history after a sequence cursor.
- `GET /api/observations?limit=20` — latest structured observations.
- `POST /api/perception` — accepts `{ "sensorId": "camera.front", "type": "visual", "data": { ... } }`.
- `POST /api/move` — bounded virtual movement, e.g. `{ "delta": { "x": 0.1, "y": 0, "z": -0.1 }, "turn": { "yaw": 5 } }`.
- `POST /api/hardware-status` — record explicitly supplied hardware status.

## Safety and honest status

- Loopback-only listener; Node.js built-ins only, no cloud provider, external API, paid token, or added package.
- Movement is simulated only. No camera capture, microphone capture, motor driver, physical actuation, or automatic Digital Brain connection is implemented in this first slice.
- Hardware status is caller-supplied metadata, not device discovery. Never mark a sensor connected without independent verification.
- Motion steps are limited to 0.25 units, turns to 30 degrees per request, and the virtual body stays inside fixed world bounds.
- Observation payloads are limited to 8 KiB; event history is bounded.

## Verification

Run `node --test .\UnifiedField\AvatarBody\avatar-body.test.cjs` with Node.js 18+ from the repository root.

Next integration step: add a read-only adapter to the Unified Field dashboard that polls state/events/observations, followed by a real camera adapter and a reviewed movement adapter. Physical actuation remains disabled until device-specific interlocks and stop behavior are implemented and tested.
