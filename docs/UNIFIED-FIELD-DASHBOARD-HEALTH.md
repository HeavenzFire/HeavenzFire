# Unified Field dashboard worker health

The dashboard probes the existing local worker at `127.0.0.1:8798/health`. The worker is considered:

- **healthy** only when the response is HTTP-successful, identifies the expected service, and reports a boolean `writable: true`;
- **degraded** when the expected service responds but reports `writable: false` (for example, an invalid/corrupt journal);
- **unreachable / HTTP failure** when the probe fails;
- **invalid health response** when the JSON shape or service identity is unexpected.

The dashboard reports status only; it does not expose the worker's bearer token. A successful dashboard health response does not prove task dispatch, replay, or external service integration is functioning. The classification tests run independently from the live worker so malformed responses and degraded states remain testable.
