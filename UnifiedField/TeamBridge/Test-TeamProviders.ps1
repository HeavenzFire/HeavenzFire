#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$RegistryPath = (Join-Path $PSScriptRoot 'team-registry.json'),
    [ValidateRange(1,10)][int]$TimeoutSeconds = 2
)
$ErrorActionPreference = 'Stop'

$registry = Get-Content -LiteralPath $RegistryPath -Raw | ConvertFrom-Json
$cliNames = @{
    'gemini-antigravity-cli' = 'agy'
    'claude' = 'claude'
    'github-copilot' = 'copilot'
    'openai-codex-cli' = 'codex'
    'qwen-cli' = 'qwen'
}
$results = @()
foreach ($provider in $registry.providers) {
    $result = [ordered]@{
        provider_id = $provider.id
        name = $provider.name
        registry_status = $provider.initial_status
        observed_status = 'unknown'
        evidence = ''
        checked_at = (Get-Date).ToUniversalTime().ToString('o')
    }
    if ($provider.endpoint -and $provider.endpoint -match '^http://127\.0\.0\.1:\d+(/.*)?$') {
        try {
            $response = Invoke-WebRequest -Uri $provider.endpoint -Method Get -TimeoutSec $TimeoutSeconds -UseBasicParsing
            if ([int]$response.StatusCode -eq 200) {
                $result.observed_status = 'verified'
                $result.evidence = 'HTTP 200 from loopback endpoint; body omitted from report.'
            } else {
                $result.observed_status = 'unavailable'
                $result.evidence = 'HTTP status ' + [int]$response.StatusCode
            }
        } catch {
            $result.observed_status = 'unavailable'
            $result.evidence = 'Loopback probe failed: ' + $_.Exception.GetType().Name
        }
    } elseif ($cliNames.ContainsKey($provider.id)) {
        $command = Get-Command $cliNames[$provider.id] -ErrorAction SilentlyContinue
        if ($command) {
            $result.observed_status = 'cli_present_auth_unverified'
            $result.evidence = 'Executable found at ' + $command.Source + '; authentication was not inspected or inferred.'
        } else {
            $result.observed_status = 'cli_missing'
            $result.evidence = 'Expected CLI executable not found on PATH.'
        }
    } elseif ($provider.id -eq 'github-chatgpt-session') {
        $result.observed_status = 'session_only'
        $result.evidence = 'Current-session connector is not probed from the local PC.'
    } elseif ($provider.id -eq 'gemini-github-app') {
        $result.observed_status = 'installation_incomplete'
        $result.evidence = 'GitHub App installation must be completed in GitHub UI; no changes made by this script.'
    }
    $results += [pscustomobject]$result
}
[pscustomobject]@{
    schema = 'heavenzfire.team.provider-probe.v1'
    checked_at = (Get-Date).ToUniversalTime().ToString('o')
    machine = $env:COMPUTERNAME
    credential_values_read = $false
    external_provider_requests_made = $false
    results = $results
} | ConvertTo-Json -Depth 6