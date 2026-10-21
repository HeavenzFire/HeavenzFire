#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'LocalAI'),
    [string]$InferenceBaseUrl = 'http://127.0.0.1:11800/v1',
    [ValidateRange(0,1)][int]$MaxRepairAttempts = 1,
    [ValidateNotNullOrEmpty()][string[]]$Models = @('heavenzfire-qwen-0.5b')
)
$ErrorActionPreference = 'Stop'
$prompt = @'
Return ONLY valid JSON: no markdown fences and no prose. Use exactly these fields: task, function_name, code, tests. Set task and function_name to Get-SumSafe. The code string must define this PowerShell 5.1 function: function Get-SumSafe { param([int[]]$InputValues) $sum = 0; foreach ($value in $InputValues) { $sum += $value }; return $sum }. The tests array must contain exactly two objects: {"input":[1,2,3],"expected_output":6} and {"input":[-1,-2,-3],"expected_output":-6}. Do not add fields or claim tests were executed.
'@

. (Join-Path $PSScriptRoot 'Test-LocalModelWorkerResponse.ps1')

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$results = @()
foreach ($model in $Models) {
    $item = [ordered]@{ model=$model; started=(Get-Date).ToString('o'); ok=$false; response=''; error=''; duration_ms=0; validation=$null; repair_attempted=$false; repair_error=''; repair_validation=$null; initial_response=''; repair_response=''; attempt_count=0 }
    $timer = [Diagnostics.Stopwatch]::StartNew()
    try {
        $body = @{ model=$model; messages=@(@{role='system';content='Return only the requested JSON artifact. Do not claim tests ran unless executed.'},@{role='user';content=$prompt}); stream=$false; temperature=0; max_tokens=220 } | ConvertTo-Json -Depth 6
        $response = Invoke-RestMethod -Uri ($InferenceBaseUrl.TrimEnd('/') + '/chat/completions') -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 180
        $item.response = [string]$response.choices[0].message.content
        $item.ok = -not [string]::IsNullOrWhiteSpace($item.response)
        $item.attempt_count = 1
        if ($item.ok) {
            $item.validation = Test-WorkerResponse -Response $item.response
            if ($item.validation.passed -and $item.validation.normalized_response -and $item.validation.normalized_response -ne $item.response) {
                $item.initial_response = $item.response
                $item.response = $item.validation.normalized_response
            }
            if (-not $item.validation.passed -and $MaxRepairAttempts -gt 0) {
                $item.repair_attempted = $true
                $item.initial_response = $item.response
                $repairPrompt = $prompt + "`nThe prior response failed static checks: " + ($item.validation.issues -join ', ') + ". Correct those issues. In tests, input must be a numeric JSON array, not a quoted string. Return only valid JSON with no fences or prose."
                $repairBody = @{ model=$model; messages=@(@{role='system';content='Return only the requested JSON artifact. Do not claim tests ran unless executed.'},@{role='user';content=$repairPrompt}); stream=$false; temperature=0; max_tokens=220 } | ConvertTo-Json -Depth 6
                $item.attempt_count = 2
                try {
                    $repair = Invoke-RestMethod -Uri ($InferenceBaseUrl.TrimEnd('/') + '/chat/completions') -Method Post -ContentType 'application/json' -Body $repairBody -TimeoutSec 90
                    $repairText = [string]$repair.choices[0].message.content
                    if (-not [string]::IsNullOrWhiteSpace($repairText)) {
                        $item.repair_validation = Test-WorkerResponse -Response $repairText
                        if ($item.repair_validation.passed) {
                            $item.repair_response = $repairText
                            $item.response = $item.repair_validation.normalized_response
                            $item.validation = $item.repair_validation
                        } else {
                            $item.repair_response = $repairText
                        }
                    } else {
                        $item.repair_error = 'empty repair response'
                    }
                } catch {
                    $item.repair_error = $_.Exception.Message
                }
            }
        } else {
            $item.validation = [pscustomobject]@{ passed=$false; issues=@('generation_failed') }
        }
    } catch {
        $item.error = $_.Exception.Message
        $item.validation = [pscustomobject]@{ passed=$false; issues=@('generation_failed') }
    }
    $timer.Stop()
    $item.duration_ms = $timer.ElapsedMilliseconds
    $results += [pscustomobject]$item
}
$path = Join-Path $OutputDirectory ('worker-smoke-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
ConvertTo-Json -InputObject @($results) -Depth 8 | Set-Content -LiteralPath $path -Encoding UTF8
$summary = [ordered]@{ ok=(@($results | Where-Object { $_.ok -and $_.validation.passed }).Count -eq $Models.Count); count=$results.Count; generated=@($results | Where-Object { $_.ok }).Count; validated=@($results | Where-Object { $_.validation.passed }).Count; file=$path; results=$results }
$summary | ConvertTo-Json -Depth 8 -Compress
if (@($results | Where-Object { -not $_.ok -or -not $_.validation.passed }).Count -gt 0) { exit 2 }