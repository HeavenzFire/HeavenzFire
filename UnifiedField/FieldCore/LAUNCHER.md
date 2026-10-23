# Unified Field Task Inbox Control

Use the root `Enter-UnifiedField.ps1` for diagnostics. Use the one-command wrapper below to manage the local task inbox without mixing it with the older HeavenzFire state directory.

## Commands

```powershell
# Start the local loopback task inbox
.\UnifiedField\Invoke-UnifiedFieldTaskInbox.ps1 -Action Start

# Check status
.\UnifiedField\Invoke-UnifiedFieldTaskInbox.ps1 -Action Status

# Submit a pending proposal (never executes it)
.\UnifiedField\Invoke-UnifiedFieldTaskInbox.ps1 -Action Submit -Source 'manual-review' -Goal 'Describe the bounded task here.'

# Review pending proposals (read-only)
.\UnifiedField\Invoke-UnifiedFieldTaskInbox.ps1 -Action Review

# Machine-readable review data
.\UnifiedField\Invoke-UnifiedFieldTaskInbox.ps1 -Action Review -AsJson

# Stop only a process owned by the launcher
.\UnifiedField\Invoke-UnifiedFieldTaskInbox.ps1 -Action Stop

# Use a custom isolated data directory or non-default port
.\UnifiedField\Invoke-UnifiedFieldTaskInbox.ps1 -Action Start -StateRoot 'C:\\Users\\YourUser\\AppData\\Local\\HeavenzFire\\UnifiedFieldRuntime\\state' -Port 19876
```

The wrapper requires Node.js 18+, binds to `127.0.0.1`, and defaults to `%LOCALAPPDATA%\HeavenzFire\UnifiedFieldRuntime\state`, separate from the older `%LOCALAPPDATA%\HeavenzFire\UnifiedField` directory. It stores task records, logs, and PID files locally and refuses to stop a process unless the recorded PID's command line matches the expected task inbox server.

## Local 16-role model orchestration

The inference DAG is a separate command from the metadata-only task inbox. From PowerShell 5.1:

```powershell
.\UnifiedField\FieldCore\Start-SixteenRoleOrchestrator.ps1 -Goal 'Audit the local Unified Field runtime; identify evidence, defects, and next tests.' -MaxParallel 2 -MaxTokens 256
```

The launcher requires Node.js 18+ and targets the loopback inference endpoint `http://127.0.0.1:11800` by default. Override `-Endpoint` and `-Model` only for a trusted local inference service; the Node entry point rejects non-loopback URLs. The run writes JSON reports under `UnifiedField\QuantumLab\reports`.

The sixteen roles are a dependency-ordered workflow, not sixteen independently hosted model processes. A role is blocked if a prerequisite fails, refuses, returns empty output, or is truncated. A structurally complete report still has status `review_required`; model-generated text is not proof that tests ran or changes were made. See [the orchestrator guide](../QuantumLab/README-16-ROLE-ORCHESTRATOR.md).

## Scope and safety

Starting the task inbox does **not** start model workers, execute queued tasks, enable unattended agent actions, install browser extensions, or claim that all Unified Field components are operational. Proposals remain `proposed` / `pending` until a separate approval workflow is implemented and exercised. The JSONL inbox is preserved when the service stops.

The Windows CI smoke test starts the service on a temporary loopback port, posts one synthetic pending task, verifies idempotent start, status and read-only review, stops the owned process, and checks that the pending record remains on disk.
