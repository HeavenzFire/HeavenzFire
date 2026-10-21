[CmdletBinding()]
param(
    [Parameter()]
    [string]$CapabilityRegistry = (Join-Path $PSScriptRoot "examples\capability-registry.json"),
    [Parameter()]
    [string]$NodeRegistry = (Join-Path $PSScriptRoot "examples\nodes.json"),
    [Parameter()]
    [ValidateRange(0.1, 60.0)]
    [double]$TimeoutSeconds = 2.0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    Write-Error "Python 3.10+ is required. Install Python and ensure 'python' is on PATH."
    exit 2
}

$entrypoint = Join-Path $PSScriptRoot "tools\unified_field.py"
$healthProbe = Join-Path $PSScriptRoot "tools\health_probe.py"
$validator = Join-Path $PSScriptRoot "tools\validate_capabilities.py"
$requiredFiles = @($entrypoint, $healthProbe, $validator, $CapabilityRegistry, $NodeRegistry)
foreach ($path in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Write-Error "Required Unified Field file not found: $path"
        exit 2
    }
}

Write-Host "HeavenzFire Unified Field — local diagnostic mode" -ForegroundColor Cyan
Write-Host "Capability registry: $CapabilityRegistry"
Write-Host "Node registry:       $NodeRegistry"
Write-Host "No capability entrypoints will be executed." -ForegroundColor DarkGray

& $python.Source $entrypoint $CapabilityRegistry $NodeRegistry --timeout $TimeoutSeconds
$exitCode = $LASTEXITCODE
if ($exitCode -eq 0) {
    Write-Host "Unified Field status: ALIVE" -ForegroundColor Green
} elseif ($exitCode -eq 1) {
    Write-Warning "Unified Field status: DARK. Review the JSON report above for exact reasons."
} else {
    Write-Error "Unified Field diagnostic exited with code $exitCode."
}
exit $exitCode
