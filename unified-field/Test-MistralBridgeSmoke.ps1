#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$bridge = Join-Path $PSScriptRoot 'Invoke-HeavenzFireMistralBridge.ps1'
$tempRoot = Join-Path $env:RUNNER_TEMP ('heavenzfire-mistral-smoke-' + [guid]::NewGuid().ToString('N'))
$outputDirectory = Join-Path $tempRoot 'out'
$responsePath = Join-Path $tempRoot 'sample-response.txt'
$null = New-Item -ItemType Directory -Path $tempRoot -Force

function Invoke-BridgeProcess([string[]]$BridgeArguments, [int]$TimeoutMilliseconds = 30000) {
    $stdoutPath = Join-Path $tempRoot ([guid]::NewGuid().ToString('N') + '.stdout.txt')
    $stderrPath = Join-Path $tempRoot ([guid]::NewGuid().ToString('N') + '.stderr.txt')
    $allArguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $bridge) + $BridgeArguments
    $quotedArguments = @()
    foreach ($argument in $allArguments) {
        $value = [string]$argument
        if ($value.Contains('"')) { $value = $value.Replace('"', '\"') }
        $quotedArguments += '"' + $value + '"'
    }
    $argumentLine = $quotedArguments -join ' '
    $process = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $argumentLine -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -WindowStyle Hidden
    if (-not $process.WaitForExit($TimeoutMilliseconds)) {
        $process.Kill()
        $process.WaitForExit()
        throw 'Mistral bridge process exceeded the 30-second smoke-test timeout.'
    }
    $process.Refresh()
    $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw -Encoding UTF8 } else { '' }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw -Encoding UTF8 } else { '' }
    return [pscustomobject]@{ ExitCode = $process.ExitCode; Stdout = $stdout; Stderr = $stderr }
}

try {
    $task = 'CI smoke test: preserve task identity and never execute imported model output.'
    $exportProcess = Invoke-BridgeProcess @('-Mode', 'Export', '-Task', $task, '-OutputDirectory', $outputDirectory)
    if ($null -ne $exportProcess.ExitCode -and $exportProcess.ExitCode -ne 0) { throw ('Export failed (exit ' + $exportProcess.ExitCode + '): ' + $exportProcess.Stderr + ' ' + $exportProcess.Stdout) }
    $export = $exportProcess.Stdout | ConvertFrom-Json
    if ($export.status -ne 'PROMPT_EXPORTED') { throw 'Export mode did not report PROMPT_EXPORTED.' }
    if ([string]::IsNullOrWhiteSpace($export.task_id)) { throw 'Export mode did not return a task ID.' }
    if (-not (Test-Path -LiteralPath $export.prompt_file -PathType Leaf)) { throw 'Export prompt file is missing.' }
    if (-not (Test-Path -LiteralPath $export.envelope_file -PathType Leaf)) { throw 'Export envelope file is missing.' }
    Write-Host 'PASS: export mode creates prompt and envelope.'

    $badIdProcess = Invoke-BridgeProcess @('-Mode', 'Export', '-TaskId', '..\outside', '-Task', $task, '-OutputDirectory', $outputDirectory)
    $badIdOutput = $badIdProcess.Stdout + ' ' + $badIdProcess.Stderr
    if (($null -ne $badIdProcess.ExitCode -and $badIdProcess.ExitCode -eq 0) -or $badIdOutput -notmatch 'TaskId must contain only') {
        throw ('Path-like TaskId was not rejected. Output: ' + $badIdOutput)
    }
    Write-Host 'PASS: path-like task IDs are rejected.'

    Set-Content -LiteralPath $responsePath -Value 'Unverified CI sample response. No code execution.' -Encoding UTF8
    $importProcess = Invoke-BridgeProcess @('-Mode', 'Import', '-TaskId', $export.task_id, '-Task', $task, '-ResponsePath', $responsePath, '-OutputDirectory', $outputDirectory)
    if ($null -ne $importProcess.ExitCode -and $importProcess.ExitCode -ne 0) { throw ('Import failed (exit ' + $importProcess.ExitCode + '): ' + $importProcess.Stderr + ' ' + $importProcess.Stdout) }
    $import = $importProcess.Stdout | ConvertFrom-Json
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
$global:LASTEXITCODE = 0
