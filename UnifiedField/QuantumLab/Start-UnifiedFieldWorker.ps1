[CmdletBinding()]
param(
    [string]$JournalPath = (Join-Path $PSScriptRoot "data\bridge-tasks.jsonl"),
    [int]$Port = 8798
)

$ErrorActionPreference = "Stop"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "Node.js is required. Install Node.js 22 or newer, then reopen PowerShell."
}
if ($Port -lt 1024 -or $Port -gt 65535) {
    throw "Port must be between 1024 and 65535."
}
if (-not $env:HEAVENZFIRE_BRIDGE_TOKEN) {
    throw "Set HEAVENZFIRE_BRIDGE_TOKEN to a long random secret in this PowerShell session before launching. Do not commit or share the token."
}

$env:HEAVENZFIRE_BRIDGE_JOURNAL = [System.IO.Path]::GetFullPath($JournalPath)
$env:HEAVENZFIRE_BRIDGE_PORT = [string]$Port
Write-Host "Starting HeavenzFire local worker on 127.0.0.1:$Port"
Write-Host "Journal: $env:HEAVENZFIRE_BRIDGE_JOURNAL"
Write-Host "Task execution: disabled; API only records metadata and checks replay eligibility."
& $node.Source (Join-Path $PSScriptRoot "uf-local-worker.cjs")
if ($LASTEXITCODE -ne 0) {
    throw "HeavenzFire local worker exited with code $LASTEXITCODE."
}
