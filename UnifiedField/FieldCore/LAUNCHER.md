# Unified Field Task Inbox Launcher

The root `Enter-UnifiedField.ps1` remains the diagnostic entrypoint. `Invoke-TaskInbox.ps1` independently manages only the local loopback task inbox.

## Commands

```powershell
# Start the local task inbox
.\UnifiedField\FieldCore\Invoke-TaskInbox.ps1 -Action Start

# Check status
.\UnifiedField\FieldCore\Invoke-TaskInbox.ps1 -Action Status

# List pending proposals (read-only; no approval or execution)
.\UnifiedField\FieldCore\Review-TaskInbox.ps1

# Get machine-readable review data
.\UnifiedField\FieldCore\Review-TaskInbox.ps1 -AsJson

# Stop only a process owned by the launcher
.\UnifiedField\FieldCore\Invoke-TaskInbox.ps1 -Action Stop

# Use a non-default port for testing
.\UnifiedField\FieldCore\Invoke-TaskInbox.ps1 -Action Start -Port 19876
```

The manager requires Node.js 18+, binds the service to `127.0.0.1`, stores task records and logs under `%LOCALAPPDATA%\HeavenzFire\UnifiedField`, and writes a PID file for lifecycle management. Set `HF_UNIFIED_FIELD_STATE_ROOT` to an absolute path to isolate this service's data from an existing HeavenzFire state directory; without it, the default path is retained. It refuses to stop a process unless the recorded PID's command line matches the expected task inbox server.

## Scope and safety

This starts **only the task inbox**. It does not start model workers, execute queued tasks, enable unattended agent actions, or claim that all Unified Field components are operational. Proposals remain `proposed` / `pending` until a separate approval workflow is implemented and exercised. The JSONL inbox is preserved when the service stops.

The Windows CI smoke test starts the service on a temporary loopback port, posts one synthetic pending task, verifies idempotent start and status, stops the owned process, and checks that the pending record remains on disk.
