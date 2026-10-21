#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$Launcher = Join-Path $PSScriptRoot '..\..\Enter-UnifiedField.ps1'
$TempRoot = Join-Path $env:RUNNER_TEMP ('hf-launcher-smoke-' + [guid]::NewGuid().ToString('N'))
$OriginalLocalAppData = $env:LOCALAPPDATA
$null = New-Item -ItemType Directory -Path $TempRoot -Force
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$Port = $listener.LocalEndpoint.Port
$listener.Stop()

try {
    $env:LOCALAPPDATA = $TempRoot
    $start = & $Launcher -TaskInbox -TaskInboxAction Start -TaskInboxPort $Port | ConvertFrom-Json
    if ($start.status -ne 'ALIVE' -or $start.taskExecutionEnabled -ne $false -or $start.modelWorkersStarted -ne $false) {
        throw ('Launcher start returned unexpected state: ' + ($start | ConvertTo-Json -Compress))
    }
    Write-Host 'PASS: launcher starts only the loopback task inbox.'

    $health = Invoke-RestMethod -Uri ($start.url + '/health') -TimeoutSec 3
    if ($health.ok -ne $true -or $health.host -ne '127.0.0.1') { throw 'Health endpoint did not report loopback service.' }

    $task = [ordered]@{
        schema = 'heavenzfire.shared-task.v1'
        taskId = 'launcher-smoke-task'
        source = 'launcher-smoke-test'
        goal = 'Verify task inbox persistence; do not execute this task.'
        status = 'proposed'
        approvalState = 'pending'
        evidence = @()
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        updatedAt = (Get-Date).ToUniversalTime().ToString('o')
        metadata = @{}
    }
    $body = @{ taskRecord = $task } | ConvertTo-Json -Depth 8
    $posted = Invoke-RestMethod -Method Post -Uri ($start.url + '/api/tasks') -ContentType 'application/json' -Body $body -TimeoutSec 3
    if ($posted.ok -ne $true -or $posted.status -ne 'proposed') { throw 'Task inbox did not accept a pending proposal.' }

    $again = & $Launcher -TaskInbox -TaskInboxAction Start -TaskInboxPort $Port | ConvertFrom-Json
    if ($again.status -ne 'ALREADY_RUNNING') { throw 'Second Start did not report ALREADY_RUNNING.' }
    Write-Host 'PASS: start is idempotent and proposals remain pending.'

    $status = & $Launcher -TaskInbox -TaskInboxAction Status -TaskInboxPort $Port | ConvertFrom-Json
    if ($status.status -ne 'ALIVE' -or $status.ownedByLauncher -ne $true -or $status.storedTaskCount -ne 1) {
        throw ('Status returned unexpected state: ' + ($status | ConvertTo-Json -Compress))
    }

    $stop = & $Launcher -TaskInbox -TaskInboxAction Stop -TaskInboxPort $Port | ConvertFrom-Json
    if ($stop.status -ne 'STOPPED' -or $stop.stopped -ne $true -or $stop.inboxPreserved -ne $true) {
        throw ('Stop returned unexpected state: ' + ($stop | ConvertTo-Json -Compress))
    }
    $inbox = Join-Path $TempRoot 'HeavenzFire\UnifiedField\task-inbox.jsonl'
    $persisted = Get-Content -LiteralPath $inbox -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($persisted.taskRecord.status -ne 'proposed' -or $persisted.taskRecord.approvalState -ne 'pending') {
        throw 'Persisted proposal was not retained in pending state.'
    }
    Write-Output 'PASS: stop is ownership-checked and preserves the pending task record.'
}
finally {
    if ($null -ne $OriginalLocalAppData) { $env:LOCALAPPDATA = $OriginalLocalAppData }
    else { Remove-Item Env:LOCALAPPDATA -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $TempRoot) {
        Get-ChildItem -LiteralPath $TempRoot -Recurse -File -ErrorAction SilentlyContinue | Out-Null
        Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
