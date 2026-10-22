[CmdletBinding()]
param(
    [string]$Model = "heavenzfire-qwen-0.5b",
    [string]$InferenceBaseUrl = "http://127.0.0.1:11800/v1",
    [int]$Port = 11812,
    [switch]$SkipTests,
    [switch]$RequireInference
)

$ErrorActionPreference = "Stop"
$ServerPath = Join-Path $PSScriptRoot "HeavenzFire-Unified-Intelligence-Server.cjs"
$RuntimeTests = Join-Path $PSScriptRoot "historical-profile-runtime.test.cjs"
$ServerTests = Join-Path $PSScriptRoot "HeavenzFire-Unified-Intelligence-Server.test.cjs"
$ClientTests = Join-Path $PSScriptRoot "micro-mind-unified-client.test.cjs"
$SupervisorTests = Join-Path $PSScriptRoot "unified-restart-policy.test.cjs"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is not on PATH. Install Node.js 18+ and reopen PowerShell."
}
$NodeVersion = (& node --version 2>&1 | Out-String).Trim()
Write-Host "Node runtime: $NodeVersion"

if (-not $SkipTests) {
    Write-Host "Running unified runtime acceptance tests..."
    & node --test $RuntimeTests $ServerTests $ClientTests $SupervisorTests
    if ($LASTEXITCODE -ne 0) {
        throw "Unified runtime, UI client, or supervisor tests failed; service was not started."
    }
}

if ($RequireInference) {
    $CanaryUrl = $InferenceBaseUrl.TrimEnd("/") + "/chat/completions"
    $Payload = @{
        model = $Model
        messages = @(
            @{ role = "system"; content = "Reply with exactly HF_UNIFIED_CANARY_OK and nothing else." },
            @{ role = "user"; content = "Canary check." }
        )
        stream = $false
        temperature = 0
        top_p = 1
        seed = 0
        max_tokens = 24
    } | ConvertTo-Json -Depth 6
    try {
        $Canary = Invoke-RestMethod -Uri $CanaryUrl -Method Post -ContentType "application/json" -Body $Payload -TimeoutSec 45
        $Answer = [string]$Canary.choices[0].message.content
        if ($Answer -notmatch "HF_UNIFIED_CANARY_OK") {
            throw "Canary response did not contain the required token. Response: $($Answer.Substring(0, [Math]::Min(160, $Answer.Length)))"
        }
        Write-Host "Inference canary: PASS"
    }
    catch {
        throw "Inference preflight failed; unified API was not started. $($_.Exception.Message)"
    }
}

$HealthUri = "http://127.0.0.1:$Port/api/health"
try {
    $Existing = Invoke-RestMethod -Uri $HealthUri -TimeoutSec 2
    if ($Existing.service -eq "HeavenzFire Unified Intelligence") {
        Write-Host "Unified Intelligence is already responding at $HealthUri"
        $Existing | ConvertTo-Json -Depth 5
        return
    }
    throw "Port $Port is already serving a different application. Nothing was stopped or overwritten."
}
catch {
    if ($_.Exception.Message -like "Port $Port is already serving a different application*") { throw }
    # A connection failure is expected when the service is not yet running.
}

$OldPort = $env:HF_UNIFIED_PORT
$OldBaseUrl = $env:HF_UNIFIED_BASE_URL
$OldModel = $env:HF_UNIFIED_MODEL
try {
    $env:HF_UNIFIED_PORT = [string]$Port
    $env:HF_UNIFIED_BASE_URL = $InferenceBaseUrl
    $env:HF_UNIFIED_MODEL = $Model
    Write-Host "Starting HeavenzFire Unified Intelligence at http://127.0.0.1:$Port"
    Write-Host "Inference target: $InferenceBaseUrl"
    Write-Host "Model: $Model"
    Write-Host "Press Ctrl+C to stop. This does not replace or modify the existing :11811 UI."
    & node $ServerPath
    if ($LASTEXITCODE -ne 0) {
        throw "Unified Intelligence server exited with code $LASTEXITCODE."
    }
}
finally {
    $env:HF_UNIFIED_PORT = $OldPort
    $env:HF_UNIFIED_BASE_URL = $OldBaseUrl
    $env:HF_UNIFIED_MODEL = $OldModel
}
