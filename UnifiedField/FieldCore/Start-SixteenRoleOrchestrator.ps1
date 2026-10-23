[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string]$Goal,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$Endpoint = 'http://127.0.0.1:11800',

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$Model = 'heavenzfire-qwen-0.5b',

    [Parameter()]
    [ValidateRange(1, 4)]
    [int]$MaxParallel = 2,

    [Parameter()]
    [ValidateRange(16, 512)]
    [int]$MaxTokens = 256,

    [Parameter()]
    [ValidateRange(1000, 120000)]
    [int]$TimeoutMs = 90000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw 'Node.js 18 or newer is required; node was not found on PATH.'
}

$majorVersion = & $node.Source -p "Number(process.versions.node.split('.')[0])"
if ($LASTEXITCODE -ne 0 -or [int]$majorVersion -lt 18) {
    throw 'Node.js 18 or newer is required for built-in fetch and AbortController support.'
}

$runner = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\QuantumLab\sixteen-role-orchestrator.cjs'))
if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) {
    throw "16-role orchestrator not found: $runner"
}

Write-Host 'HeavenzFire Unified Field — local 16-role DAG' -ForegroundColor Cyan
Write-Host ('Endpoint: ' + $Endpoint)
Write-Host ('Model:    ' + $Model)
Write-Host ('Parallel: ' + $MaxParallel)
Write-Host 'Inference is loopback-only; model output remains untrusted and requires semantic review.' -ForegroundColor DarkYellow

& $node.Source $runner $Goal "--endpoint=$Endpoint" "--model=$Model" "--max-parallel=$MaxParallel" "--max-tokens=$MaxTokens" "--timeout-ms=$TimeoutMs"
$exitCode = $LASTEXITCODE
exit $exitCode
