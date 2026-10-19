# HeavenzFire Unified Operator

A local-first, auditable workbench intended to combine conversational task orchestration, browser automation, local computer tools, data analysis, and model adapters behind one interface.

## Current foundation

- Python standard-library HTTP server and SQLite task ledger.
- Loopback-only binding by default (`127.0.0.1:8765`).
- Fixed action registry; no arbitrary shell-command endpoint.
- Explicit approval before a task executes.
- Read-only Windows diagnostics and optional local Ollama health check.
- Task state and audit event persistence.
- Basic browser UI served by the local process.

## Run on Windows 11

Requires Python 3.10+ and Windows PowerShell 5.1.

```powershell
python .\run.py
```

Open `http://127.0.0.1:8765`. Stop with Ctrl+C.

Run the tests:

```powershell
python -m unittest discover -s tests -v
```

## Security boundaries

- The service binds to loopback only. Do not expose it to a LAN or forward its port.
- Every task must be approved in the UI before execution.
- Only registered action IDs can be run; clients cannot submit arbitrary shell text.
- Current Windows actions are read-only diagnostics.
- Do not place credentials, tokens, or private data in task descriptions.
- This is a foundation, not full ChatGPT parity and not a remote-device bridge.

## Roadmap

1. Hardened task API, tests, and audit trail.
2. Local model adapter for Ollama with timeouts and bounded tool selection.
3. Workspace-scoped file operations and data-analysis tools.
4. Browser automation adapter with an isolated profile and action-level approvals.
5. Authenticated phone-to-PC pairing and encrypted transport.
6. Agent planning, resumable workflows, artifact generation, and verification reports.

## Principle

A task is complete only when its result is observed and recorded. Status text or an agent's claim is not evidence of success.
