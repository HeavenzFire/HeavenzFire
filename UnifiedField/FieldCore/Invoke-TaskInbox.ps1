#requires -Version 5.1
<#
.SYNOPSIS
    Starts, checks, or stops the local Unified Field task inbox.
.DESCRIPTION
    Manages only the loopback task inbox. It does not start model workers,
    execute queued tasks, install browser extensions, or claim full-system readiness.
#>
[CmdletBinding()]
param(
    [ValidateSet('Start', 'Status', 'Stop')]
    [string]$Action = 'Start',

    [ValidateRange(1024, 65535)]
    [int]$Port = 18796
)

$ErrorActionPreference = 'Stop'
$FieldCoreRoot = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ServerPath = Join-Path $FieldCoreRoot 'task-inbox-server.cjs'
if (-not (Test-Path -LiteralPath $ServerPath -PathType Leaf)) {
    throw "Task inbox server is missing: $ServerPath"
}

$Node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $Node) { $Node = Get-Command node -ErrorAction Stop }
$NodePath = $Node.Source
$NodeVersionText = (& $NodePath --version | Select-Object -First 1).Trim()
if ($NodeVersionText -notmatch '^v(\d+)\.') { throw "Unable to parse Node.js version: $NodeVersionText" }
if ([int]$Matches[1] -lt 18) { throw "Node.js 18 or later is required; found $NodeVersionText" }
if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    throw 'LOCALAPPDATA is not set; refusing to choose a nonstandard persistence location.'
}

$StateRoot = Join-Path $env:LOCALAPPDATA 'HeavenzFire\UnifiedField'
$PidPath = Join-Path $StateRoot ("task-inbox-{0}.pid" -f $Port)
$InboxPath = Join-Path $StateRoot 'task-inbox.jsonl'
$StdoutPath = Join-Path $StateRoot ("task-inbox-{0}.stdout.log" -f $Port)
$StderrPath = Join-Path $StateRoot ("task-inbox-{0}.stderr.log" -f $Port)
$BaseUrl = 'http://127.0.0.1:' + $Port
$null = New-Item -ItemType Directory -Path $StateRoot -Force

function Get-HfTaskInboxHealth {
    try {
        $health = Invoke-RestMethod -Uri ($script:BaseUrl + '/health') -TimeoutSec 1
        if ($health.ok -eq $true -and
            $health.service -eq 'heavenzfire-unified-field-task-inbox' -and
            [int]$health.port -eq $script:Port) {
            return $health
        }
    } catch {
        return $null
    }
    return $null
}

function Get-HfOwnedProcess([int]$ProcessId) {
    try {
        $processInfo = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ProcessId) -ErrorAction Stop
        if (-not $processInfo) { return $null }
        if ([string]$processInfo.CommandLine -notmatch [regex]::Escape($script:ServerPath)) { return $null }
        return $processInfo
    } catch {
        return $null
    }
}

if ($Action -eq 'Status') {
    $health = Get-HfTaskInboxHealth
    $owned = $false
    $processId = $null
    if (Test-Path -LiteralPath $PidPath -PathType Leaf) {
        $rawPid = (Get-Content -LiteralPath $PidPath -Raw).Trim()
        $parsedPid = 0
        if ([int]::TryParse($rawPid, [ref]$parsedPid) -and $parsedPid -gt 0) {
            if (Get-HfOwnedProcess -ProcessId $parsedPid) {
                $owned = $true
                $processId = $parsedPid
            }
        }
    }
    [pscustomobject]@{
        status = if ($health) { 'ALIVE' } else { 'DARK' }
        service = 'task-inbox-only'
        url = $BaseUrl
        pid = $processId
        ownedByLauncher = $owned
        storedTaskCount = if ($health) { $health.storedTaskCount } else { $null }
        modelWorkersStarted = $false
        taskExecutionEnabled = $false
    } | ConvertTo-Json -Depth 5
    return
}

if ($Action -eq 'Stop') {
    if (-not (Test-Path -LiteralPath $PidPath -PathType Leaf)) {
        $health = Get-HfTaskInboxHealth
        [pscustomobject]@{
            status = if ($health) { 'RUNNING_UNOWNED' } else { 'NOT_RUNNING' }
            stopped = $false
            reason = 'No launcher-owned PID record; refusing to stop an unowned process.'
            url = $BaseUrl
        } | ConvertTo-Json -Depth 4
        return
    }
    $rawPid = (Get-Content -LiteralPath $PidPath -Raw).Trim()
    $processId = 0
    if (-not [int]::TryParse($rawPid, [ref]$processId) -or $processId -le 0) {
        throw 'PID record is malformed; refusing to stop an unknown process.'
    }
    $ownedProcess = Get-HfOwnedProcess -ProcessId $processId
    if (-not $ownedProcess) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($process) { throw 'PID record does not match the expected Node task inbox; refusing to stop an unrelated process.' }
        Remove-Item -LiteralPath $PidPath -Force
        [pscustomobject]@{ status = 'NOT_RUNNING'; stopped = $false; pid = $processId; url = $BaseUrl } | ConvertTo-Json -Depth 4
        return
    }
    Stop-Process -Id $processId -Force
    for ($i = 0; $i -lt 20; $i++) {
        if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 250
    }
    if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
        throw "Task inbox process $processId did not stop within five seconds."
    }
    Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
    [pscustomobject]@{
        status = 'STOPPED'
        stopped = $true
        pid = $processId
        url = $BaseUrl
        inboxPreserved = (Test-Path -LiteralPath $InboxPath)
    } | ConvertTo-Json -Depth 4
    return
}

$existingHealth = Get-HfTaskInboxHealth
if ($existingHealth) {
    $existingPid = $null
    $owned = $false
    if (Test-Path -LiteralPath $PidPath -PathType Leaf) {
        $rawPid = (Get-Content -LiteralPath $PidPath -Raw).Trim()
        $parsedPid = 0
        if ([int]::TryParse($rawPid, [ref]$parsedPid) -and $parsedPid -gt 0 -and (Get-HfOwnedProcess -ProcessId $parsedPid)) {
            $existingPid = $parsedPid
            $owned = $true
        }
    }
    [pscustomobject]@{
        status = 'ALREADY_RUNNING'
        service = 'task-inbox-only'
        url = $BaseUrl
        pid = $existingPid
        ownedByLauncher = $owned
        storedTaskCount = $existingHealth.storedTaskCount
        modelWorkersStarted = $false
        taskExecutionEnabled = $false
    } | ConvertTo-Json -Depth 5
    return
}

$oldPort = $env:HF_UNIFIED_FIELD_TASK_PORT
$oldInbox = $env:HF_UNIFIED_FIELD_INBOX_FILE
$process = $null
try {
    $env:HF_UNIFIED_FIELD_TASK_PORT = [string]$Port
    $env:HF_UNIFIED_FIELD_INBOX_FILE = $InboxPath
    $process = Start-Process -FilePath $NodePath -ArgumentList ('"' + $ServerPath + '"') -WorkingDirectory $RepoRoot -WindowStyle Hidden -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath -PassThru
} finally {
    if ($null -eq $oldPort) { Remove-Item Env:HF_UNIFIED_FIELD_TASK_PORT -ErrorAction SilentlyContinue } else { $env:HF_UNIFIED_FIELD_TASK_PORT = $oldPort }
    if ($null -eq $oldInbox) { Remove-Item Env:HF_UNIFIED_FIELD_INBOX_FILE -ErrorAction SilentlyContinue } else { $env:HF_UNIFIED_FIELD_INBOX_FILE = $oldInbox }
}

Set-Content -LiteralPath $PidPath -Value ([string]$process.Id) -Encoding ASCII
$health = $null
for ($i = 0; $i -lt 20; $i++) {
    if ($process.HasExited) { break }
    $health = Get-HfTaskInboxHealth
    if ($health) { break }
    Start-Sleep -Milliseconds 500
}
if (-not $health) {
    $stderr = if (Test-Path -LiteralPath $StderrPath) { Get-Content -LiteralPath $StderrPath -Raw -ErrorAction SilentlyContinue } else { '' }
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
    throw ("Task inbox failed to become healthy at " + $BaseUrl + ". " + $stderr)
}

[pscustomobject]@{
    status = 'ALIVE'
    service = 'task-inbox-only'
    url = $BaseUrl
    pid = $process.Id
    ownedByLauncher = $true
    storedTaskCount = $health.storedTaskCount
    modelWorkersStarted = $false
    taskExecutionEnabled = $false
    inboxPath = $InboxPath
    stdoutLog = $StdoutPath
    stderrLog = $StderrPath
} | ConvertTo-Json -Depth 5
