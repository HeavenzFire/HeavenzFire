$ErrorActionPreference = 'Stop'
$root = Join-Path $env:USERPROFILE 'HeavenzFire\UnifiedField\QuantumLab\LocalAI'
New-Item -ItemType Directory -Path $root -Force | Out-Null
$models = @('qwen2.5:0.5b','heavenzfire-runtime:latest','heavenzfire:latest','llama3.2:1b')
$prompt = @'
You are a coding worker. Return exactly one JSON object and no markdown with keys: task, function_name, code, tests. Write a PowerShell 5.1 function Get-SumSafe that accepts integer array InputValues and returns their sum. Include two simple test cases as JSON values. Do not claim tests ran. Keep code under 12 lines.
'@
$results = @()
foreach ($model in $models) {
  $entry = [ordered]@{ model=$model; started=(Get-Date -Format o); ok=$false; response=''; error=''; duration_ms=0 }
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $body = @{ model=$model; prompt=$prompt; stream=$false; options=@{ num_predict=220; temperature=0 } } | ConvertTo-Json -Depth 6
    $answer = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/generate' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 180
    $entry.response = [string]$answer.response
    $entry.ok = [bool]$answer.done -and -not [string]::IsNullOrWhiteSpace($entry.response)
  } catch { $entry.error = $_.Exception.Message }
  $sw.Stop(); $entry.duration_ms=$sw.ElapsedMilliseconds
  $results += [pscustomobject]$entry
  Write-Output ('MODEL=' + $model + ' OK=' + $entry.ok + ' MS=' + $entry.duration_ms)
}
$jsonPath = Join-Path $root ('worker-smoke-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.json')
$results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
Write-Output ('RESULT_FILE=' + $jsonPath)
$results | ForEach-Object { Write-Output ('--- ' + $_.model + ' ---'); if ($_.ok) { Write-Output $_.response } else { Write-Output ('ERROR=' + $_.error) } }
Write-Output 'NOTE=Model output is untrusted code text; this script did not execute model-generated code.'