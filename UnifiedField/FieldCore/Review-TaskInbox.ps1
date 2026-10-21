#requires -Version 5.1
<#
.SYNOPSIS
    Lists pending Unified Field task proposals without approving or executing them.
#>
[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 18796,

    [ValidateRange(1, 100)]
    [int]$Limit = 50,

    [switch]$AsJson
)

$ErrorActionPreference = 'Stop'
$baseUrl = 'http://127.0.0.1:' + $Port
try {
    $health = Invoke-RestMethod -Uri ($baseUrl + '/health') -TimeoutSec 3
} catch {
    throw "Unified Field task inbox is not reachable at $baseUrl. Start it with Invoke-TaskInbox.ps1 -Action Start."
}
if ($health.ok -ne $true -or
    $health.service -ne 'heavenzfire-unified-field-task-inbox' -or
    $health.host -ne '127.0.0.1' -or
    [int]$health.port -ne $Port) {
    throw 'Health response does not identify the expected loopback task inbox; refusing to display untrusted endpoint data.'
}

try {
    $listing = Invoke-RestMethod -Uri ($baseUrl + '/api/tasks?limit=' + $Limit) -TimeoutSec 3
} catch {
    throw 'Task inbox listing request failed: ' + $_.Exception.Message
}
if ($listing.ok -ne $true -or
    -not ($listing.total -is [int] -or $listing.total -is [long]) -or
    -not ($listing.returned -is [int] -or $listing.returned -is [long])) {
    throw 'Task inbox returned an invalid listing response.'
}

$tasks = @($listing.tasks)
foreach ($task in $tasks) {
    if ($task.status -ne 'proposed' -or $task.approvalState -ne 'pending') {
        throw 'Task inbox returned a record outside proposed/pending state; refusing to treat it as a pending proposal.'
    }
}

if ($AsJson) {
    [ordered]@{
        schema = 'heavenzfire.task-inbox-review.v1'
        status = 'ALIVE'
        readOnly = $true
        total = $listing.total
        returned = $tasks.Count
        tasks = $tasks
    } | ConvertTo-Json -Depth 10
    return
}

if ($tasks.Count -eq 0) {
    Write-Output 'No pending proposals.'
    Write-Output 'Read-only review only: this command does not approve or execute tasks.'
    return
}

$rows = foreach ($task in $tasks) {
    [pscustomobject]@{
        TaskId = $task.taskId
        Source = $task.source
        Status = $task.status
        Approval = $task.approvalState
        CreatedAt = $task.createdAt
        Goal = $task.goal
    }
}
$rows | Format-List
Write-Output 'Read-only review only: this command does not approve or execute tasks.'
