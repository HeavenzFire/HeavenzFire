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
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$results = @()
foreach ($model in $models) {
    $item = [ordered]@{ model=$model; started=(Get-Date).ToString('o'); ok=$false; response=''; error=''; duration_ms=0 }
    $timer = [Diagnostics.Stopwatch]::StartNew()
    try {
        $body = @{ model=$model; prompt=$prompt; stream=$false; options=@{ temperature=0; num_predict=220 } } | ConvertTo-Json -Depth 6
        $response = Invoke-RestMethod -Uri ($OllamaBaseUrl.TrimEnd('/') + '/api/generate') -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 180
        $item.response = [string]$response.response
        $item.ok = [bool]$response.done -and -not [string]::IsNullOrWhiteSpace($item.response)
    } catch {
        $item.error = $_.Exception.Message
    }
    $timer.Stop()
    $item.duration_ms = $timer.ElapsedMilliseconds
    $results += [pscustomobject]$item
}
$path = Join-Path $OutputDirectory ('worker-smoke-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $path -Encoding UTF8
$summary = [ordered]@{ ok=(@($results | Where-Object { $_.ok }).Count -eq $models.Count); count=$results.Count; successful=@($results | Where-Object { $_.ok }).Count; file=$path; results=$results }
$summary | ConvertTo-Json -Depth 8 -Compress
if (@($results | Where-Object { -not $_.ok }).Count -gt 0) { exit 2 }
