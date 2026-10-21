#requires -Version 5.1
<#
.SYNOPSIS
    Submits a local task proposal to the Unified Field inbox.
.DESCRIPTION
    Creates a proposed/pending record only. It never executes the task or
    changes approval state.
#>
[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 18796,

    [string]$TaskId,

    [string]$Source = 'powershell-cli',

    [Parameter(Mandatory = $true)]
    [string]$Goal,

    [switch]$AsJson
)

$ErrorActionPreference = 'Stop'
$Source = $Source.Trim()
$Goal = $Goal.Trim()
if ([string]::IsNullOrWhiteSpace($Source) -or $Source.Length -gt 128) {
    throw 'Source must be 1 to 128 non-whitespace characters.'
}
if ([string]::IsNullOrWhiteSpace($Goal) -or $Goal.Length -gt 4000) {
    throw 'Goal must be 1 to 4000 non-whitespace characters.'
}
if ([string]::IsNullOrWhiteSpace($TaskId)) {
    $TaskId = [guid]::NewGuid().ToString('N')
} else {
    $TaskId = $TaskId.Trim()
    if ($TaskId.Length -gt 128 -or -not [regex]::IsMatch($TaskId, '^[A-Za-z0-9_-]+$')) {
        throw 'TaskId must contain only letters, digits, underscores, or hyphens (maximum 128 characters).'
    }
}

$baseUrl = 'http://127.0.0.1:' + $Port
try {
    $health = Invoke-RestMethod -Uri ($baseUrl + '/health') -TimeoutSec 3
} catch {
    throw "Unified Field task inbox is not reachable at $baseUrl. Start it with Invoke-UnifiedFieldTaskInbox.ps1 -Action Start."
}
if ($health.ok -ne $true -or
    $health.service -ne 'heavenzfire-unified-field-task-inbox' -or
    $health.host -ne '127.0.0.1' -or
    [int]$health.port -ne $Port) {
    throw 'Health response does not identify the expected loopback task inbox; refusing to submit to an unexpected endpoint.'
}

$now = (Get-Date).ToUniversalTime().ToString('o')
$taskRecord = [ordered]@{
    schema = 'heavenzfire.shared-task.v1'
    taskId = $TaskId
    source = $Source
    goal = $Goal
    status = 'proposed'
    approvalState = 'pending'
    evidence = @()
    createdAt = $now
    updatedAt = $now
    metadata = @{}
}
$body = @{ taskRecord = $taskRecord } | ConvertTo-Json -Depth 8
try {
    $response = Invoke-RestMethod -Method Post -Uri ($baseUrl + '/api/tasks') -ContentType 'application/json' -Body $body -TimeoutSec 5
} catch {
    throw 'Task proposal was not accepted by the local inbox: ' + $_.Exception.Message
}
if ($response.ok -ne $true -or
    $response.status -ne 'proposed' -or
    $response.taskId -ne $TaskId) {
    throw 'Task inbox response did not confirm a proposed/pending task record.'
}

$result = [ordered]@{
    schema = 'heavenzfire.task-submission.v1'
    status = 'PROPOSAL_SUBMITTED'
    taskId = $TaskId
    source = $Source
    approvalState = 'pending'
    executionStarted = $false
    port = $Port
}
if ($AsJson) {
    $result | ConvertTo-Json -Depth 5
} else {
    Write-Output ("Proposal submitted: " + $TaskId)
    Write-Output ("State: proposed / pending; execution started: false; source: " + $Source)
}
