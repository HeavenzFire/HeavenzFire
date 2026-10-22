[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('connection_check', 'local_runtime_health', 'unified_field_tests')]
    [string]$Operation,
    [Parameter(Mandatory = $false)]
    [ValidatePattern('^[A-Za-z0-9_-]{16,80}$')]
    [string]$SessionNonce = ''
)
$ErrorActionPreference = 'Stop'
$protocolVersion = 'heavenzfire.desktop-bridge.v1'
if ([string]::IsNullOrWhiteSpace($SessionNonce)) { $SessionNonce = [Guid]::NewGuid().ToString('N') }
$capabilities = @('connection_check', 'local_runtime_health', 'unified_field_tests')
$results = @()
$overall = 'OK'
switch ($Operation) {
    'connection_check' {
        if ($env:RUNNER_OS -ne 'Windows') { throw "Expected a Windows runner; RUNNER_OS='$env:RUNNER_OS'." }
        foreach ($tool in @('node', 'git')) {
            $command = Get-Command $tool -ErrorAction SilentlyContinue
            if (-not $command) { $results += [pscustomobject]@{ name = $tool; status = 'MISSING' }; $overall = 'DEGRADED'; continue }
            $version = (& $tool --version 2>&1 | Select-Object -First 1) -join ' '
            if ($LASTEXITCODE -ne 0) { $results += [pscustomobject]@{ name = $tool; status = 'FAILED' }; $overall = 'DEGRADED' }
            else { $results += [pscustomobject]@{ name = $tool; status = 'OK'; version = $version } }
        }
    }
    'local_runtime_health' {
        $targets = @(@{ Name = 'ollama'; Url = 'http://127.0.0.1:11434/api/tags' }, @{ Name = 'heavenzfire-gateway'; Url = 'http://127.0.0.1:8787/health' }, @{ Name = 'heavenzfire-orchestrator'; Url = 'http://127.0.0.1:8788/health' }, @{ Name = 'heavenzfire-agent'; Url = 'http://127.0.0.1:8790/health' })
        foreach ($target in $targets) {
            try { $response = Invoke-WebRequest -Uri $target.Url -Method Get -TimeoutSec 3 -UseBasicParsing; $results += [pscustomobject]@{ name = $target.Name; status = 'REACHABLE'; http_status = [int]$response.StatusCode } }
            catch { $status = 'UNREACHABLE'; if ($_.Exception.Response -and $_.Exception.Response.StatusCode) { $status = 'HTTP_' + [int]$_.Exception.Response.StatusCode }; $results += [pscustomobject]@{ name = $target.Name; status = $status }; $overall = 'DEGRADED' }
        }
    }
    'unified_field_tests' {
        & node --test 'UnifiedField/QuantumLab/uf-tcp-policy.test.cjs' 'UnifiedField/QuantumLab/uf-bridge-journal.test.cjs' 'UnifiedField/QuantumLab/uf-local-worker.test.cjs'
        if ($LASTEXITCODE -ne 0) { $overall = 'FAILED'; $results += [pscustomobject]@{ name = 'unified_field_tests'; status = 'FAILED'; exit_code = $LASTEXITCODE } }
        else { $results += [pscustomobject]@{ name = 'unified_field_tests'; status = 'PASSED'; exit_code = 0 } }
    }
}
$report = [ordered]@{ protocol_version = $protocolVersion; session_nonce = $SessionNonce; nonce_echo = $SessionNonce; operation = $Operation; status = $overall; capabilities = $capabilities; runner_os = $env:RUNNER_OS; runner_arch = $env:RUNNER_ARCH; repository = $env:GITHUB_REPOSITORY; revision = $env:GITHUB_SHA; timestamp_utc = [DateTime]::UtcNow.ToString('o'); results = @($results) }
$report | ConvertTo-Json -Depth 6 -Compress
if ($overall -eq 'FAILED') { exit 1 }