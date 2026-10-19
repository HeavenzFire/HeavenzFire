#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][ValidateLength(1,650)][string]$EvidenceText,
    [ValidateLength(1,100)][string]$SourceReference = 'user-provided text',
    [string]$CaptureTimestamp = (Get-Date).ToString('o'),
    [ValidateRange(15,300)][int]$TimeoutSeconds = 120
)
$ErrorActionPreference = 'Stop'
$CouncilScript = Join-Path $env:USERPROFILE 'HeavenzFire\Invoke-HeavenzFireCouncil.ps1'
$RubricPath = 'C:\Users\rucke\heavenzfire-capsule-v02\ecosystem-integration\guardian\anti-manipulation-rubric.json'
$StateRoot = Join-Path $env:LOCALAPPDATA 'HeavenzFire\UnifiedField'
$CouncilReportRoot = Join-Path $StateRoot 'council-reports'
$GuardianReportRoot = Join-Path $StateRoot 'guardian-reports'

if (-not (Test-Path -LiteralPath $CouncilScript)) { throw "Council runner missing: $CouncilScript" }
if (-not (Test-Path -LiteralPath $RubricPath)) { throw "Guardian rubric missing: $RubricPath" }
$rubric = Get-Content -LiteralPath $RubricPath -Raw | ConvertFrom-Json
if ($rubric.schema_version -ne '1.0.0' -or -not $rubric.signals) { throw 'Guardian rubric schema check failed.' }

$signalCatalog = (@($rubric.signals | ForEach-Object { $_.id + '=' + $_.label }) -join '; ')
$auditPrompt = @"
Defensive UI review only. Use these rubric signals: $signalCatalog
Source reference: $SourceReference
Capture timestamp: $CaptureTimestamp
Evidence text (quote only what is present): $EvidenceText

Assess only visible evidence. Return: signal_id; status (observed/inferred/not_observable); exact evidence quote; rationale; confidence 0-1; plausible counter-evidence; limitation; user-protective mitigation; human_review_status=pending. If no signal is supported, say so. Do not claim a hidden algorithm, intent, illegality, or diagnosis from text alone. Do not browse, place bets, or execute actions.
"@
if ($auditPrompt.Length -gt 1600) { throw ("Evidence plus rubric prompt is " + $auditPrompt.Length + " characters; reduce EvidenceText or SourceReference.") }

$null = New-Item -ItemType Directory -Path $CouncilReportRoot -Force
$null = New-Item -ItemType Directory -Path $GuardianReportRoot -Force
$before = @(Get-ChildItem -LiteralPath $CouncilReportRoot -Filter 'council-*.json' -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
Write-Host '=== HEAVENZFIRE GUARDIAN TEXT EVIDENCE AUDIT ===' -ForegroundColor Cyan
Write-Host 'Privacy reminder: redact names, account IDs, payment details, and unrelated personal data first.'
Write-Host 'Input is treated as evidence, not proof. This workflow does not access the referenced source.'
& $CouncilScript -Prompt $auditPrompt -Mode 'guardian-review' -TimeoutSeconds $TimeoutSeconds
$after = @(Get-ChildItem -LiteralPath $CouncilReportRoot -Filter 'council-*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
$councilReportPath = $null
foreach ($file in $after) {
    if ($before -notcontains $file.FullName) { $councilReportPath = $file.FullName; break }
}
if (-not $councilReportPath) { throw 'Council report was not found after the run; no Guardian report was written.' }

$reportPath = Join-Path $GuardianReportRoot ('guardian-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.json')
$report = [ordered]@{
    schema_version = '1.0.0'
    captured_at = (Get-Date).ToString('o')
    source_reference = $SourceReference
    evidence_capture_timestamp = $CaptureTimestamp
    evidence_text = $EvidenceText
    rubric_version = $rubric.schema_version
    rubric_status = $rubric.status
    council_report_path = $councilReportPath
    review_status = 'pending'
    decision = 'No automated accusation or external action. Human review required.'
    limitations = @(
        'Text-only MVP; no OCR or browser acquisition.',
        'Model outputs may be wrong and are not legal or clinical findings.',
        'Visible evidence alone cannot prove hidden algorithm behavior or intent.'
    )
}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Host ("Guardian evidence report saved: " + $reportPath) -ForegroundColor Green
Write-Host 'Audit complete. Review the evidence and counter-evidence before taking action.'