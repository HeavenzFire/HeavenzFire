#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$bridge = Join-Path $PSScriptRoot 'Invoke-HeavenzFireMistralBridge.ps1'
$tempRoot = Join-Path $env:RUNNER_TEMP ('heavenzfire-mistral-smoke-' + [guid]::NewGuid().ToString('N'))
$outputDirectory = Join-Path $tempRoot 'out'
$responsePath = Join-Path $tempRoot 'sample-response.txt'
$null = New-Item -ItemType Directory -Path $tempRoot -Force

try {
    $task = 'CI smoke test: preserve task identity and never execute imported model output.'
    $exportText = & $bridge -Mode Export -Task $task -OutputDirectory $outputDirectory | Out-String
    $export = $exportText | ConvertFrom-Json
    if ($export.status -ne 'PROMPT_EXPORTED') { throw 'Export mode did not report PROMPT_EXPORTED.' }
    if ([string]::IsNullOrWhiteSpace($export.task_id)) { throw 'Export mode did not return a task ID.' }
    if (-not (Test-Path -LiteralPath $export.prompt_file -PathType Leaf)) { throw 'Export prompt file is missing.' }
    if (-not (Test-Path -LiteralPath $export.envelope_file -PathType Leaf)) { throw 'Export envelope file is missing.' }

    $badTaskIdRejected = $false
    try {
        & $bridge -Mode Export -TaskId '..\outside' -Task $task -OutputDirectory $outputDirectory | Out-Null
    } catch {
        if ($_.Exception.Message -match 'TaskId must contain only') { $badTaskIdRejected = $true } else { throw }
    }
    if (-not $badTaskIdRejected) { throw 'Path-like TaskId was not rejected.' }

    Set-Content -LiteralPath $responsePath -Value 'Unverified CI sample response. No code execution.' -Encoding UTF8
    $importText = & $bridge -Mode Import -TaskId $export.task_id -Task $task -ResponsePath $responsePath -OutputDirectory $outputDirectory | Out-String
    $import = $importText | ConvertFrom-Json
    if ($import.status -ne 'MANUAL_RESPONSE_IMPORTED') { throw 'Import mode did not report MANUAL_RESPONSE_IMPORTED.' }
    if ($import.task_id -ne $export.task_id) { throw 'Task ID changed between export and import.' }
    if ($import.code_executed -ne $false) { throw 'Import mode must explicitly report code_executed=false.' }
    if (-not (Test-Path -LiteralPath $import.result_file -PathType Leaf)) { throw 'Imported evidence file is missing.' }

    $saved = Get-Content -LiteralPath $import.result_file -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($saved.verification -ne 'UNVERIFIED_USER_SUPPLIED_MODEL_OUTPUT') { throw 'Imported response lost its unverified status.' }
    if ($saved.task_id -ne $export.task_id) { throw 'Saved evidence does not retain the task ID.' }
    if ($saved.executed_tests.Count -ne 0 -or $saved.repository_changes.Count -ne 0) {
        throw 'Imported response must not claim tests or repository changes.'
    }
    Write-Output 'PASS: PowerShell 5.1 export/import smoke test; task identity preserved; model output remains unverified and unexecuted.'
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
