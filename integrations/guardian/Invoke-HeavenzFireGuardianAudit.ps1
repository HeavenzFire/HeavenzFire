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
if ($rubric.schema_version -ne '1.0.0' -or -not $rubric.signals -or -not $rubric.deterministic_patterns) { throw 'Guardian rubric schema check failed.' }
$allowedSignalIds = @($rubric.signals | ForEach-Object { [string]$_.id })

$signalCatalog = (@($rubric.signals | ForEach-Object { $_.id + '=' + $_.label }) -join '; ')
$ruleDefinitions = @($rubric.deterministic_patterns | ForEach-Object {
    [pscustomobject]@{
        id = [string]$_.signal_id
        pattern = [string]$_.pattern
        rationale = [string]$_.rationale
    }
})
$ruleFindings = @()
foreach ($rule in $ruleDefinitions) {
    if ($allowedSignalIds -contains $rule.id) {
        $match = [regex]::Match($EvidenceText, $rule.pattern)
        if ($match.Success) {
            $ruleFindings += [pscustomobject]@{
                signal_id = $rule.id
                status = 'observed_text_cue'
                exact_quote = $match.Value
                quote_valid = $EvidenceText.Contains($match.Value)
                signal_id_valid = $true
                rationale = $rule.rationale
                confidence = 1.0
                interpretation_limit = 'This validates the presence of a text cue only; it does not prove intent, harm, illegality, or hidden algorithm behavior.'
            }
        }
    }
}
$ruleValidationSummary = [ordered]@{
    rules_evaluated = $ruleDefinitions.Count
    signals_found = $ruleFindings.Count
    all_quotes_exact_substrings = @($ruleFindings | Where-Object { $_.quote_valid }).Count -eq $ruleFindings.Count
    all_signal_ids_in_rubric = @($ruleFindings | Where-Object { $_.signal_id_valid }).Count -eq $ruleFindings.Count
}
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

function Get-HfResponseValidation([string]$Text,[string[]]$AllowedIds,[string]$Evidence) {
    $clean = $Text -replace '^\s*[\x60]{3}(?:json)?\s*','' -replace '\s*[\x60]{3}\s*$',''
    $parsed = $null
    try { $parsed = $clean | ConvertFrom-Json -ErrorAction Stop } catch {
        $jsonMatch = [regex]::Match($clean, '(?s)\{.*\}')
        if ($jsonMatch.Success) { try { $parsed = $jsonMatch.Value | ConvertFrom-Json -ErrorAction Stop } catch {} }
    }
    $modelFindings = @()
    if ($parsed -and $parsed.findings) { $modelFindings = @($parsed.findings) }
    elseif ($parsed -and $parsed.signal_id) { $modelFindings = @($parsed) }
    $checks = @()
    if ($modelFindings.Count -gt 0) {
        foreach ($finding in $modelFindings) {
            $signalId = [string]$finding.signal_id
            $quote = ''
            if ($finding.PSObject.Properties.Name -contains 'exact_quote') { $quote = [string]$finding.exact_quote }
            elseif ($finding.PSObject.Properties.Name -contains 'Exact Evidence Quote') { $quote = [string]$finding.'Exact Evidence Quote' }
            $checks += [pscustomobject]@{
                signal_id = $signalId
                signal_id_valid = ($AllowedIds -contains $signalId)
                exact_quote = $quote
                quote_valid = ($quote.Length -gt 0 -and $Evidence.Contains($quote))
                status = [string]$finding.status
                validation_method = 'parsed_json'
            }
        }
    } else {
        $signalMatches = [regex]::Matches($Text, '"signal_id"\s*:\s*"(?<value>(?:\\.|[^"\\])*)"')
        $quoteMatches = [regex]::Matches($Text, '"exact_quote"\s*:\s*"(?<value>(?:\\.|[^"\\])*)"')
        $matchCount = [Math]::Max($signalMatches.Count,$quoteMatches.Count)
        for ($i=0; $i -lt $matchCount; $i++) {
            $signalId = ''
            $quote = ''
            if ($i -lt $signalMatches.Count) {
                $rawSignal = $signalMatches[$i].Groups['value'].Value
                try { $signalId = [string](ConvertFrom-Json ('"' + $rawSignal + '"') -ErrorAction Stop) } catch { $signalId = $rawSignal }
            }
            if ($i -lt $quoteMatches.Count) {
                $rawQuote = $quoteMatches[$i].Groups['value'].Value
                try { $quote = [string](ConvertFrom-Json ('"' + $rawQuote + '"') -ErrorAction Stop) } catch { $quote = $rawQuote }
            }
            $checks += [pscustomobject]@{
                signal_id = $signalId
                signal_id_valid = ($AllowedIds -contains $signalId)
                exact_quote = $quote
                quote_valid = ($quote.Length -gt 0 -and $Evidence.Contains($quote))
                status = 'unverified_model_output'
                validation_method = 'field_regex_fallback'
            }
        }
    }
    return [pscustomobject]@{ json_parseable=($null -ne $parsed); findings=@($checks) }
}

$councilReport = Get-Content -LiteralPath $councilReportPath -Raw | ConvertFrom-Json
$allowedSignalIds = @($rubric.signals | ForEach-Object { [string]$_.id })
$candidateValidation = @()
foreach ($candidate in @($councilReport.candidates)) {
    $validated = Get-HfResponseValidation ([string]$candidate.response) $allowedSignalIds $EvidenceText
    $candidateValidation += [pscustomobject]@{
        model = $candidate.model
        worker_id = $candidate.worker_id
        task_status = $candidate.status
        json_parseable = $validated.json_parseable
        findings = @($validated.findings)
    }
}
$allChecks = @()
foreach ($candidateCheck in $candidateValidation) { $allChecks += @($candidateCheck.findings) }
$reviewText = [string]$councilReport.reviewer.response
$reviewValidated = Get-HfResponseValidation $reviewText $allowedSignalIds $EvidenceText
$reviewChecks = @($reviewValidated.findings)
$reviewParsed = $null
$reviewClean = $reviewText -replace '^\s*[\x60]{3}(?:json)?\s*','' -replace '\s*[\x60]{3}\s*$',''
try { $reviewParsed = $reviewClean | ConvertFrom-Json -ErrorAction Stop } catch {
    $reviewMatch = [regex]::Match($reviewClean, '(?s)\{.*\}')
    if ($reviewMatch.Success) { try { $reviewParsed = $reviewMatch.Value | ConvertFrom-Json -ErrorAction Stop } catch {} }
}
$reviewQuoteChecks = @()
foreach ($bucket in @('supported_quotes','unsupported_quotes')) {
    if ($reviewParsed -and $reviewParsed.$bucket) {
        foreach ($quoteItem in @($reviewParsed.$bucket)) {
            $quoteValue = [string]$quoteItem
            $reviewQuoteChecks += [pscustomobject]@{
                bucket = $bucket
                quote = $quoteValue
                quote_present_in_evidence = ($quoteValue.Length -gt 0 -and $EvidenceText.Contains($quoteValue))
            }
        }
    }
}
$validationSummary = [ordered]@{
    candidate_count = $candidateValidation.Count
    json_parseable_candidates = @($candidateValidation | Where-Object { $_.json_parseable }).Count
    candidate_findings_checked = $allChecks.Count
    candidate_valid_exact_quotes = @($allChecks | Where-Object { $_.quote_valid }).Count
    candidate_invalid_or_missing_quotes = @($allChecks | Where-Object { -not $_.quote_valid }).Count
    candidate_valid_signal_ids = @($allChecks | Where-Object { $_.signal_id_valid }).Count
    candidate_invalid_signal_ids = @($allChecks | Where-Object { -not $_.signal_id_valid }).Count
    reviewer_response_parseable = $reviewValidated.json_parseable
    reviewer_findings_checked = $reviewChecks.Count
    reviewer_valid_exact_quotes = @($reviewChecks | Where-Object { $_.quote_valid }).Count
    reviewer_invalid_or_missing_quotes = @($reviewChecks | Where-Object { -not $_.quote_valid }).Count
    reviewer_invalid_signal_ids = @($reviewChecks | Where-Object { -not $_.signal_id_valid }).Count
    reviewer_quotes_checked = $reviewQuoteChecks.Count
    reviewer_quotes_valid = @($reviewQuoteChecks | Where-Object { $_.quote_present_in_evidence }).Count
    reviewer_quotes_invalid = @($reviewQuoteChecks | Where-Object { -not $_.quote_present_in_evidence }).Count
}
$reportPath = Join-Path $GuardianReportRoot ('guardian-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.json')
$report = [ordered]@{
    schema_version = '1.0.0'
    captured_at = (Get-Date).ToString('o')
    source_reference = $SourceReference
    evidence_capture_timestamp = $CaptureTimestamp
    evidence_text = $EvidenceText
    rubric_version = $rubric.schema_version
    rubric_status = $rubric.status
    deterministic_rule_findings = @($ruleFindings)
    deterministic_rule_summary = $ruleValidationSummary
    council_report_path = $councilReportPath
    candidate_validation = @($candidateValidation)
    reviewer_findings_validation = @($reviewChecks)
    reviewer_quote_validation = @($reviewQuoteChecks)
    validation_summary = $validationSummary
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
Write-Host ("Deterministic text cues found=" + $ruleValidationSummary.signals_found + "; all rule quotes exact=" + $ruleValidationSummary.all_quotes_exact_substrings)
Write-Host ("Deterministic checks: candidate valid quotes=" + $validationSummary.candidate_valid_exact_quotes + "; candidate invalid/missing quotes=" + $validationSummary.candidate_invalid_or_missing_quotes + "; candidate invalid signal IDs=" + $validationSummary.candidate_invalid_signal_ids + "; reviewer invalid quotes=" + $validationSummary.reviewer_invalid_or_missing_quotes)
Write-Host 'Audit complete. Review the evidence and counter-evidence before taking action.'