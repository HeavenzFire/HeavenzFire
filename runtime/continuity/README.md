# HeavenzFire Local Continuity v0

A first local-first supervisor for durable tasks and bounded multi-agent discussion. Python standard library only. It does not create a network listener, execute agent-proposed shell commands, or contact external services. Its only model endpoint is the configured Ollama URL, defaulting to `127.0.0.1:11434`.

## What it does
- Stores tasks, events, and reusable lessons in SQLite with WAL and FULL synchronous commits.
- Runs three local roles in sequence: Planner, Guardian, Builder. Their messages are persisted.
- Re-queues tasks if local inference fails.
- Keeps bounded retrieval memory of prior lessons for later cycles.
- Has status, enqueue, single-cycle, and self-test modes.

**Training clarification:** this is memory/retrieval-based adaptation, not fine-tuning or changing model weights.

## Requirements
- Windows 11 or another Python 3.12+ environment.
- Ollama installed and running locally.
- A model installed locally. Default: `heavenzfire-runtime:latest`.
- Set `HEAVENZFIRE_MODEL` to an installed model name if needed.

## Run from PowerShell 5.1
```powershell
Set-Location "$HOME\HeavenzFire"
python .\runtime\continuity\heavenzfire_continuity.py --self-test
python .\runtime\continuity\heavenzfire_continuity.py --status
python .\runtime\continuity\heavenzfire_continuity.py --enqueue "Review guardian health checks and propose a test"
python .\runtime\continuity\heavenzfire_continuity.py
```
The foreground process is the supervisor. Use a separate PowerShell window to inspect status or enqueue work. Stop gracefully with Ctrl+C.

To use another local Ollama model:
```powershell
$env:HEAVENZFIRE_MODEL = "heavenzfire:latest"
python .\runtime\continuity\heavenzfire_continuity.py
```

Default DB: `%USERPROFILE%\AppData\Local\HeavenzFire\Continuity\continuity.sqlite3`. Override with `HEAVENZFIRE_DATA`.

## Safety / limitations
- No remote command execution and no network listener.
- Model endpoint defaults to loopback only; do not point it at an untrusted remote endpoint.
- Agent outputs are proposals, not authority. Human review is required before code changes, credential use, destructive actions, or external publication.
- Production-grade backoff, service installation, peer authentication, signed task envelopes, multi-device failover, and model fine-tuning are not implemented.
- Local inference, Windows startup, and long-running reliability must be tested on the target machine before claiming operational readiness.
