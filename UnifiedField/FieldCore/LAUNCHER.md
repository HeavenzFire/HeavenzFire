# Unified Field Task Inbox Launcher

The root `Enter-UnifiedField.ps1` remains the diagnostic entrypoint by default. The optional `-TaskInbox` mode starts, checks, or stops only the local loopback task inbox.

## Commands

```powershell
# Start the local task inbox
.\Enter-UnifiedField.ps1 -TaskInbox

# Check status
.\Enter-UnifiedField.ps1 -TaskInbox -TaskInboxAction Status

# Stop only a process owned by the launcher
.\Enter-UnifiedField.ps1 -TaskInbox -TaskInboxAction Stop

# Use a non-default port for testing
.\Enter-UnifiedField.ps1 -TaskInbox -TaskInboxAction Start -TaskInboxPort 19876
```

The launcher requires Node.js 18+, binds the service to `127.0.0.1`, stores task records and logs under `%LOCALAPPDATA%\HeavenzFire\UnifiedField`, and writes a PID file for lifecycle management. It refuses to stop a process unless the recorded PID's command line matches the expected task inbox server.

## Scope and safety

This starts **only the task inbox**. It does not start model workers, execute queued tasks, enable unattended agent actions, install browser extensions, or claim that all Unified Field components are operational. Proposals remain `proposed` / `pending` until a separate approval workflow is implemented and exercised. The JSONL inbox is preserved when the service stops.

The Windows CI smoke test starts the service on a temporary loopback port, posts one synthetic pending task, verifies idempotent start and status, stops the owned process, and checks that the pending record remains on disk.
