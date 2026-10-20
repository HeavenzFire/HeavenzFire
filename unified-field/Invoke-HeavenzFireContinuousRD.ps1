#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateRange(1, 100000)][int]$Cycles = 1,
    [ValidateRange(5, 3600)][int]$IntervalSeconds = 30,
    [switch]$Continuous,
    [string]$ResearchGoal,
    [switch]$SkipTests
)
$ErrorActionPreference = 'Stop'
$Root = Join-Path $env:USERPROFILE 'HeavenzFire\UnifiedField'
$RD = Join-Path $env:USERPROFILE 'heavenzfire-capsule-v02\rd-pipeline'
$NodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $NodeCommand) { $NodeCommand = Get-Command node -ErrorAction SilentlyContinue }
if (-not $NodeCommand) { throw 'Node.js is required but was not found on PATH.' }
$Node = $NodeCommand.Source
$FieldRunner = Join-Path $Root 'Invoke-UnifiedField.ps1'
$ReportRoot = Join-Path $Root 'FieldCore\reports\continuous-rd'
$null = New-Item -ItemType Directory -Path $ReportRoot -Force
$Tests = @(
    (Join-Path $Root 'BrowserBridge\bridge-server.test.cjs'),
    (Join-Path $Root 'PropagationFabric\fabric-envelope.test.cjs'),
    (Join-Path $Root 'PropagationFabric\multimodal-quadruple.test.cjs'),
    (Join-Path $Root 'BraidedPipeline\test-braided-pipeline.cjs'),
    (Join-Path $Root 'FieldCore\unified-field.test.cjs'),
    (Join-Path $Root 'FieldCore\verify-report.test.cjs')
)
foreach ($Path in @($Root, $RD, $FieldRunner)) {
    if (-not (Test-Path -LiteralPath $Path)) { throw "Required existing component missing: $Path" }
}
function Get-QueueSnapshot {
    $result = [ordered]@{}
    foreach ($stage in @('pending','active','review','approved','archived','failed')) {
        $path = Join-Path $RD ("queue\" + $stage)
        $result[$stage] = if (Test-Path $path) { @(Get-ChildItem -LiteralPath $path -Filter '*.json' -File -ErrorAction SilentlyContinue).Count } else { $null }
    }
    return $result
}
function Get-LocalRuntime {
    try {
        $tags = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3
        return [ordered]@{ reachable = $true; models = @($tags.models | ForEach-Object { $_.name }); endpoint = 'http://127.0.0.1:11434' }
    } catch {
        return [ordered]@{ reachable = $false; models = @(); endpoint = 'http://127.0.0.1:11434'; error = $_.Exception.Message }
    }
}

function Get-ServiceSnapshot {
    $definitions = @(
        @{ name = 'Gateway'; url = 'http://127.0.0.1:8787/health' },
        @{ name = 'Orchestrator'; url = 'http://127.0.0.1:8788/health' },
        @{ name = 'ToolService'; url = 'http://127.0.0.1:8789/health' },
        @{ name = 'Agent'; url = 'http://127.0.0.1:8790/health' },
        @{ name = 'MemoryService'; url = 'http://127.0.0.1:8791/health' },
        @{ name = 'EcosystemHub'; url = 'http://127.0.0.1:8792/health' },
        @{ name = 'UniversalAPI'; url = 'http://127.0.0.1:8793/health' },
        @{ name = 'MeshCoordinator'; url = 'http://127.0.0.1:8080/health' },
        @{ name = 'BrowserBridge'; url = 'http://127.0.0.1:18795/health' }
    )
    $results = @()
    foreach ($definition in $definitions) {
        try {
            $payload = Invoke-RestMethod -Uri $definition.url -TimeoutSec 2
            $healthy = if ($null -ne $payload.ok) { [bool]$payload.ok } else { $true }
            $results += [ordered]@{
                name = $definition.name
                endpoint = $definition.url
                status = if ($healthy) { 'HEALTHY' } else { 'UNHEALTHY' }
                response = $payload
            }
        } catch {
            $results += [ordered]@{
                name = $definition.name
                endpoint = $definition.url
                status = 'UNAVAILABLE'
                error = $_.Exception.Message
            }
        }
    }
    return @($results)
}

$completed = 0
$existingCycles = @(Get-ChildItem -LiteralPath $ReportRoot -Filter 'cycle-*.json' -File -ErrorAction SilentlyContinue | ForEach-Object { if ($_.BaseName -match '^cycle-(\d+)
    $started = (Get-Date).ToUniversalTime().ToString('o')
    Write-Host "=== HeavenzFire UnifiedField R&D cycle $cycle ===" -ForegroundColor Cyan
    $testOk = $null
    $testSummary = 'SKIPPED_BY_OPERATOR'
    $testLog = $null
    if (-not $SkipTests) {
        $testLog = Join-Path $ReportRoot ("cycle-{0:D5}-tests.txt" -f $cycle)
        $testOutput = @(& $Node '--test' $Tests 2>&1)
        $testExit = $LASTEXITCODE
        $testOutput | Set-Content -LiteralPath $testLog -Encoding UTF8
        $testOk = ($testExit -eq 0)
        $testSummary = if ($testOk) { 'PASS' } else { "FAIL_EXIT_$testExit" }
        Write-Host "Acceptance tests: $testSummary (log: $testLog)"
    }
    $runtime = Get-LocalRuntime
    $research = $null
    $researchStatus = 'NOT_REQUESTED'
    if (-not [string]::IsNullOrWhiteSpace($ResearchGoal)) {
        if (-not $runtime.reachable) {
            $researchStatus = 'BLOCKED_LOCAL_OLLAMA_UNAVAILABLE'
        } elseif ($testOk -eq $false) {
            $researchStatus = 'BLOCKED_ACCEPTANCE_TEST_FAILURE'
        } else {
            $researchLog = Join-Path $ReportRoot ("cycle-{0:D5}-research.txt" -f $cycle)
            $researchOutput = @(& $FieldRunner -Goal $ResearchGoal 2>&1)
            $researchExit = $LASTEXITCODE
            $researchOutput | Set-Content -LiteralPath $researchLog -Encoding UTF8
            $research = [ordered]@{ goal = $ResearchGoal; exit_code = $researchExit; log = $researchLog }
            $researchStatus = if ($researchExit -eq 0) { 'FIELD_RUN_COMPLETED_REVIEW_REPORT_REQUIRED' } else { "FIELD_RUN_FAILED_EXIT_$researchExit" }
        }
    }
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    $os = Get-CimInstance Win32_OperatingSystem
    $report = [ordered]@{
        schema = 'heavenzfire.continuous-rd-cycle.v1'
        cycle = $cycle
        started_utc = $started
        completed_utc = (Get-Date).ToUniversalTime().ToString('o')
        machine = $env:COMPUTERNAME
        root = $Root
        source_repository = 'https://github.com/HeavenzFire/HeavenzFire'
        acceptance_tests = [ordered]@{ status = $testSummary; ok = $testOk; log = $testLog }
        local_ollama = $runtime
        service_health = Get-ServiceSnapshot
        research = [ordered]@{ status = $researchStatus; details = $research }
        queue = Get-QueueSnapshot
        resources = [ordered]@{
            free_disk_gb = if ($disk) { [math]::Round($disk.FreeSpace / 1GB, 2) } else { $null }
            free_memory_mb = if ($os) { [math]::Round($os.FreePhysicalMemory / 1024, 0) } else { $null }
        }
        automation = [ordered]@{ continuous = [bool]$Continuous; interval_seconds = $IntervalSeconds; mutations_auto_adopted = $false; files_auto_deleted = $false }
    }
    $reportPath = Join-Path $ReportRoot ("cycle-{0:D5}.json" -f $cycle)
    $tempPath = "$reportPath.tmp"
    $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $tempPath -Encoding UTF8
    Move-Item -LiteralPath $tempPath -Destination $reportPath -Force
    Write-Host "Report: $reportPath"
    Write-Host ("Local Ollama: " + $(if ($runtime.reachable) { 'REACHABLE' } else { 'UNAVAILABLE' }))
    $completed++
    if (-not $Continuous -and $completed -ge $Cycles) { break }
    Start-Sleep -Seconds $IntervalSeconds
}
Write-Host "Continuous R&D cycle runner finished. No code was automatically adopted or deleted." -ForegroundColor Green
) { [int]$Matches[1] } })
$nextCycle = if ($existingCycles.Count -gt 0) { (($existingCycles | Measure-Object -Maximum).Maximum + 1) } else { 1 }
while ($Continuous -or $completed -lt $Cycles) {
    $cycle = $nextCycle + $completed
    $started = (Get-Date).ToUniversalTime().ToString('o')
    Write-Host "=== HeavenzFire UnifiedField R&D cycle $cycle ===" -ForegroundColor Cyan
    $testOk = $null
    $testSummary = 'SKIPPED_BY_OPERATOR'
    $testLog = $null
    if (-not $SkipTests) {
        $testLog = Join-Path $ReportRoot ("cycle-{0:D5}-tests.txt" -f $cycle)
        $testOutput = @(& $Node '--test' $Tests 2>&1)
        $testExit = $LASTEXITCODE
        $testOutput | Set-Content -LiteralPath $testLog -Encoding UTF8
        $testOk = ($testExit -eq 0)
        $testSummary = if ($testOk) { 'PASS' } else { "FAIL_EXIT_$testExit" }
        Write-Host "Acceptance tests: $testSummary (log: $testLog)"
    }
    $runtime = Get-LocalRuntime
    $research = $null
    $researchStatus = 'NOT_REQUESTED'
    if (-not [string]::IsNullOrWhiteSpace($ResearchGoal)) {
        if (-not $runtime.reachable) {
            $researchStatus = 'BLOCKED_LOCAL_OLLAMA_UNAVAILABLE'
        } elseif ($testOk -eq $false) {
            $researchStatus = 'BLOCKED_ACCEPTANCE_TEST_FAILURE'
        } else {
            $researchLog = Join-Path $ReportRoot ("cycle-{0:D5}-research.txt" -f $cycle)
            $researchOutput = @(& $FieldRunner -Goal $ResearchGoal 2>&1)
            $researchExit = $LASTEXITCODE
            $researchOutput | Set-Content -LiteralPath $researchLog -Encoding UTF8
            $research = [ordered]@{ goal = $ResearchGoal; exit_code = $researchExit; log = $researchLog }
            $researchStatus = if ($researchExit -eq 0) { 'FIELD_RUN_COMPLETED_REVIEW_REPORT_REQUIRED' } else { "FIELD_RUN_FAILED_EXIT_$researchExit" }
        }
    }
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    $os = Get-CimInstance Win32_OperatingSystem
    $report = [ordered]@{
        schema = 'heavenzfire.continuous-rd-cycle.v1'
        cycle = $cycle
        started_utc = $started
        completed_utc = (Get-Date).ToUniversalTime().ToString('o')
        machine = $env:COMPUTERNAME
        root = $Root
        source_repository = 'https://github.com/HeavenzFire/HeavenzFire'
        acceptance_tests = [ordered]@{ status = $testSummary; ok = $testOk; log = $testLog }
        local_ollama = $runtime
        service_health = Get-ServiceSnapshot
        research = [ordered]@{ status = $researchStatus; details = $research }
        queue = Get-QueueSnapshot
        resources = [ordered]@{
            free_disk_gb = if ($disk) { [math]::Round($disk.FreeSpace / 1GB, 2) } else { $null }
            free_memory_mb = if ($os) { [math]::Round($os.FreePhysicalMemory / 1024, 0) } else { $null }
        }
        automation = [ordered]@{ continuous = [bool]$Continuous; interval_seconds = $IntervalSeconds; mutations_auto_adopted = $false; files_auto_deleted = $false }
    }
    $reportPath = Join-Path $ReportRoot ("cycle-{0:D5}.json" -f $cycle)
    $tempPath = "$reportPath.tmp"
    $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $tempPath -Encoding UTF8
    Move-Item -LiteralPath $tempPath -Destination $reportPath -Force
    Write-Host "Report: $reportPath"
    Write-Host ("Local Ollama: " + $(if ($runtime.reachable) { 'REACHABLE' } else { 'UNAVAILABLE' }))
    $completed++
    if ($completed -ge $limit) { break }
    Start-Sleep -Seconds $IntervalSeconds
}
Write-Host "Continuous R&D cycle runner finished. No code was automatically adopted or deleted." -ForegroundColor Green
