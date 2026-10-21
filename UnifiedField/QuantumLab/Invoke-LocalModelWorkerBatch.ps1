#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'LocalAI'),
    [string]$OllamaBaseUrl = 'http://127.0.0.1:11434'
)
$ErrorActionPreference = 'Stop'
$models = @('qwen2.5:0.5b','heavenzfire-runtime:latest','heavenzfire:latest','llama3.2:1b')
$prompt = @'
Return one JSON object with keys task, function_name, code, tests. Draft a PowerShell 5.1 function Get-SumSafe that accepts [int[]] InputValues and returns their sum. Include two test cases with input and expected_output. No markdown. Do not claim tests were run.
'@

function Test-WorkerResponse {
    param([string]$Response)
    $issues = New-Object System.Collections.Generic.List[string]
    $candidate = $Response.Trim()
    $fence = [string][char]96 + [string][char]96 + [string][char]96
    $candidate = $candidate.Replace($fence + 'json', '').Replace($fence + 'powershell', '').Replace($fence + 'PowerShell', '').Replace($fence, '').Trim()
    try { $doc = $candidate | ConvertFrom-Json -ErrorAction Stop }
    catch { return [pscustomobject]@{ passed=$false; issues=@('response_not_json') } }

    foreach ($field in @('task','function_name','code','tests')) {
        if (-not ($doc.PSObject.Properties.Name -contains $field)) { $issues.Add('missing_field_' + $field) }
    }
    if (-not ($doc.code -is [string]) -or $doc.code -notmatch '(?is)function\s+Get-SumSafe\b') { $issues.Add('function_definition_missing') }
    if ($doc.code -notmatch '(?is)foreach\s*\(\s*\$\w+\s+in\s+\$InputValues\s*\)') { $issues.Add('input_iteration_not_verified') }
    if ($doc.code -notmatch '(?is)\$\w+\s*\+=\s*\$\w+') { $issues.Add('accumulator_not_verified') }

    if ($doc.tests -isnot [System.Array] -or $doc.tests.Count -ne 2) {
        $issues.Add('tests_schema_invalid')
    } else {
        foreach ($case in $doc.tests) {
            if ($null -eq $case.input -or $case.input -isnot [System.Array] -or $null -eq $case.expected_output) {
                $issues.Add('test_case_schema_invalid')
                continue
            }
            $sum = 0.0
            $validInputs = $true
            foreach ($value in $case.input) {
                $number = 0.0
                if (-not [double]::TryParse([string]$value, [ref]$number)) { $validInputs = $false; break }
                $sum += $number
            }
            $expected = 0.0
            if (-not $validInputs -or -not [double]::TryParse([string]$case.expected_output, [ref]$expected)) {
                $issues.Add('test_case_values_invalid')
            } elseif ($sum -ne $expected) {
                $issues.Add('test_expected_output_mismatch')
            }
        }
    }
    return [pscustomobject]@{ passed=($issues.Count -eq 0); issues=@($issues.ToArray()) }
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$results = @()
foreach ($model in $models) {
    $item = [ordered]@{ model=$model; started=(Get-Date).ToString('o'); ok=$false; response=''; error=''; duration_ms=0; validation=$null }
    $timer = [Diagnostics.Stopwatch]::StartNew()
    try {
        $body = @{ model=$model; prompt=$prompt; stream=$false; options=@{ temperature=0; num_predict=220 } } | ConvertTo-Json -Depth 6
        $response = Invoke-RestMethod -Uri ($OllamaBaseUrl.TrimEnd('/') + '/api/generate') -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 180
        $item.response = [string]$response.response
        $item.ok = [bool]$response.done -and -not [string]::IsNullOrWhiteSpace($item.response)
        if ($item.ok) { $item.validation = Test-WorkerResponse -Response $item.response } else { $item.validation = [pscustomobject]@{ passed=$false; issues=@('generation_failed') } }
    } catch {
        $item.error = $_.Exception.Message
        $item.validation = [pscustomobject]@{ passed=$false; issues=@('generation_failed') }
    }
    $timer.Stop()
    $item.duration_ms = $timer.ElapsedMilliseconds
    $results += [pscustomobject]$item
}
$path = Join-Path $OutputDirectory ('worker-smoke-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding UTF8
$summary = [ordered]@{ ok=(@($results | Where-Object { $_.ok }).Count -eq $models.Count); count=$results.Count; successful=@($results | Where-Object { $_.ok }).Count; validated=@($results | Where-Object { $_.validation.passed }).Count; file=$path; results=$results }
$summary | ConvertTo-Json -Depth 8 -Compress
if (@($results | Where-Object { -not $_.ok }).Count -gt 0) { exit 2 }
