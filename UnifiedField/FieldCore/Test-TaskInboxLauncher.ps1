#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$Launcher = Join-Path $PSScriptRoot '..\Invoke-UnifiedFieldTaskInbox.ps1'
$TempRoot = Join-Path $env:RUNNER_TEMP ('hf-launcher-smoke-' + [guid]::NewGuid().ToString('N'))
$OriginalLocalAppData = $env:LOCALAPPDATA
$OriginalStateRoot = $env:HF_UNIFIED_FIELD_STATE_ROOT
$StateRoot = Join-Path $TempRoot 'isolated-state'
$null = New-Item -ItemType Directory -Path $TempRoot -Force
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$Port = $listener.LocalEndpoint.Port
$listener.Stop()

try {
    $env:LOCALAPPDATA = $TempRoot
    $env:HF_UNIFIED_FIELD_STATE_ROOT = $StateRoot
    $start = & $Launcher -Action Start -Port $Port -StateRoot $StateRoot | ConvertFrom-Json
    if ($start.status -ne 'ALIVE' -or $start.taskExecutionEnabled -ne $false -or $start.modelWorkersStarted -ne $false) {
        throw ('Launcher start returned unexpected state: ' + ($start | ConvertTo-Json -Compress))
    }
    Write-Host 'PASS: launcher starts only the loopback task inbox.'

    $health = Invoke-RestMethod -Uri ($start.url + '/health') -TimeoutSec 3
    if ($health.ok -ne $true -or $health.host -ne '127.0.0.1') { throw 'Health endpoint did not report loopback service.' }

    $submitted = & $Launcher -Action Submit -Port $Port -StateRoot $StateRoot -TaskId 'launcher-smoke-task' -Source 'launcher-smoke-test' -Goal 'Verify task inbox persistence; do not execute this task.' -AsJson | ConvertFrom-Json
    if ($submitted.status -ne 'PROPOSAL_SUBMITTED' -or $submitted.approvalState -ne 'pending' -or $submitted.executionStarted -ne $false) {
        throw ('Proposal submission returned unexpected state: ' + ($submitted | ConvertTo-Json -Compress))
    }
    Write-Host 'PASS: submission CLI creates a proposed/pending record without execution.'

    $badSubmissionRejected = $false
    try {
        & $Launcher -Action Submit -Port $Port -StateRoot $StateRoot -TaskId '..\\outside' -Source 'launcher-smoke-test' -Goal 'This must be rejected.' -AsJson | Out-Null
    } catch {
        if ($_.Exception.Message -match 'TaskId must contain only') { $badSubmissionRejected = $true } else { throw }
    }
    if (-not $badSubmissionRejected) { throw 'Path-like task ID was not rejected by the submission CLI.' }

    $review = & $Launcher -Action Review -Port $Port -StateRoot $StateRoot -AsJson | ConvertFrom-Json
    if ($review.readOnly -ne $true -or $review.returned -ne 1 -or $review.tasks[0].taskId -ne 'launcher-smoke-task') {
        throw ('Read-only review returned unexpected data: ' + ($review | ConvertTo-Json -Compress))
    }
    Write-Host 'PASS: read-only review CLI lists the pending proposal without changing state.'

    $again = & $Launcher -Action Start -Port $Port -StateRoot $StateRoot | ConvertFrom-Json
    if ($again.status -ne 'ALREADY_RUNNING') { throw 'Second Start did not report ALREADY_RUNNING.' }
    Write-Host 'PASS: start is idempotent and proposals remain pending.'

    $status = & $Launcher -Action Status -Port $Port -StateRoot $StateRoot | ConvertFrom-Json
    if ($status.status -ne 'ALIVE' -or $status.ownedByLauncher -ne $true -or $status.storedTaskCount -ne 1) {
        throw ('Status returned unexpected state: ' + ($status | ConvertTo-Json -Compress))
    }

    $stop = & $Launcher -Action Stop -Port $Port -StateRoot $StateRoot | ConvertFrom-Json
    if ($stop.status -ne 'STOPPED' -or $stop.stopped -ne $true -or $stop.inboxPreserved -ne $true) {
        throw ('Stop returned unexpected state: ' + ($stop | ConvertTo-Json -Compress))
    }
    $inbox = Join-Path $StateRoot 'task-inbox.jsonl'
    $persisted = Get-Content -LiteralPath $inbox -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($persisted.taskRecord.status -ne 'proposed' -or $persisted.taskRecord.approvalState -ne 'pending') {
        throw 'Persisted proposal was not retained in pending state.'
    }
    Write-Output 'PASS: stop is ownership-checked and preserves the pending task record.'
}
finally {
    if ($null -ne $OriginalLocalAppData) { $env:LOCALAPPDATA = $OriginalLocalAppData }
    else { Remove-Item Env:LOCALAPPDATA -ErrorAction SilentlyContinue }
    if ($null -ne $OriginalStateRoot) { $env:HF_UNIFIED_FIELD_STATE_ROOT = $OriginalStateRoot }
    else { Remove-Item Env:HF_UNIFIED_FIELD_STATE_ROOT -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $TempRoot) {
        Get-ChildItem -LiteralPath $TempRoot -Recurse -File -ErrorAction SilentlyContinue | Out-Null
        Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$global:LASTEXITCODE = 0
