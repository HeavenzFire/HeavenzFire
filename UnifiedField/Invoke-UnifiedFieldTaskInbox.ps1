#requires -Version 5.1
<#
.SYNOPSIS
    One-command local control for the Unified Field task inbox.
.DESCRIPTION
    Manages only the loopback task inbox. The default data root is deliberately
    separate from the older %LOCALAPPDATA%\HeavenzFire\UnifiedField directory.
#>
[CmdletBinding()]
param(
    [ValidateSet('Start', 'Status', 'Stop', 'Review')]
    [string]$Action = 'Start',

    [ValidateRange(1024, 65535)]
    [int]$Port = 18796,

    [string]$StateRoot,

    [switch]$AsJson
)

$ErrorActionPreference = 'Stop'
$Manager = Join-Path $PSScriptRoot 'FieldCore\Invoke-TaskInbox.ps1'
$Review = Join-Path $PSScriptRoot 'FieldCore\Review-TaskInbox.ps1'
if (-not (Test-Path -LiteralPath $Manager -PathType Leaf)) { throw "Task inbox manager is missing: $Manager" }
if (-not (Test-Path -LiteralPath $Review -PathType Leaf)) { throw "Task inbox review CLI is missing: $Review" }
if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { throw 'LOCALAPPDATA is not set.' }

if ([string]::IsNullOrWhiteSpace($StateRoot)) {
    $StateRoot = Join-Path $env:LOCALAPPDATA 'HeavenzFire\UnifiedFieldRuntime\state'
}
if (-not [System.IO.Path]::IsPathRooted($StateRoot)) { throw 'StateRoot must be an absolute path.' }
$StateRoot = [System.IO.Path]::GetFullPath($StateRoot)

$previousStateRoot = $env:HF_UNIFIED_FIELD_STATE_ROOT
$env:HF_UNIFIED_FIELD_STATE_ROOT = $StateRoot
try {
    switch ($Action) {
        'Start'  { & $Manager -Action Start -Port $Port }
        'Status' { & $Manager -Action Status -Port $Port }
        'Stop'   { & $Manager -Action Stop -Port $Port }
        'Review' {
            if ($AsJson) { & $Review -Port $Port -AsJson }
            else { & $Review -Port $Port }
        }
    }
} finally {
    if ($null -eq $previousStateRoot) { Remove-Item Env:HF_UNIFIED_FIELD_STATE_ROOT -ErrorAction SilentlyContinue }
    else { $env:HF_UNIFIED_FIELD_STATE_ROOT = $previousStateRoot }
}
