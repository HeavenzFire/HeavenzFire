#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$RubricPath = 'C:\Users\rucke\heavenzfire-capsule-v02\ecosystem-integration\guardian\anti-manipulation-rubric.json'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $RubricPath)) { throw "Guardian rubric missing: $RubricPath" }
$rubric = Get-Content -LiteralPath $RubricPath -Raw | ConvertFrom-Json
if ($rubric.schema_version -ne '1.0.0' -or -not $rubric.signals -or -not $rubric.deterministic_patterns) { throw 'Guardian rubric schema check failed.' }
$allowedIds = @($rubric.signals | ForEach-Object { [string]$_.id })
$rules = @($rubric.deterministic_patterns)

$cases = @(
    [pscustomobject]@{ name='loss chasing'; text='You lost three rounds. Deposit now to win it back.'; expected='loss_chasing_prompt' },
    [pscustomobject]@{ name='offer urgency'; text='Offer expires in 02:00.'; expected='time_pressure_scarcity' },
    [pscustomobject]@{ name='near miss'; text='You almost won the jackpot.'; expected='near_miss_framing' },
    [pscustomobject]@{ name='autoplay'; text='Autoplay is enabled by default.'; expected='autoplay_and_reduced_friction' },
    [pscustomobject]@{ name='social proof'; text='Everyone is playing now.'; expected='social_proof_pressure' },
    [pscustomobject]@{ name='self-exclusion obstruction'; text='Self-exclusion is hard to find.'; expected='self_exclusion_obstruction' },
    [pscustomobject]@{ name='targeted loss reference'; text='We noticed you lost yesterday.'; expected='targeted_personalization' },
    [pscustomobject]@{ name='neutral clock time is not urgency'; text='Your appointment is at 05:00.'; expected='' }
)

$failures = @()
foreach ($case in $cases) {
    $matches = @()
    foreach ($rule in $rules) {
        if ($allowedIds -notcontains [string]$rule.signal_id) {
            $failures += ($case.name + ': rule uses unknown signal ID ' + $rule.signal_id)
            continue
        }
        $m = [regex]::Match($case.text, [string]$rule.pattern)
        if ($m.Success) {
            $matches += [pscustomobject]@{
                signal_id = [string]$rule.signal_id
                quote = $m.Value
                quote_valid = $case.text.Contains($m.Value)
            }
        }
    }
    if ([string]::IsNullOrEmpty($case.expected)) {
        if ($matches.Count -ne 0) { $failures += ($case.name + ': expected no signal, got ' + (($matches | ForEach-Object { $_.signal_id }) -join ',')) }
    } else {
        $found = @($matches | Where-Object { $_.signal_id -eq $case.expected })
        if ($found.Count -ne 1) { $failures += ($case.name + ': expected signal ' + $case.expected) }
        if (@($matches | Where-Object { -not $_.quote_valid }).Count -gt 0) { $failures += ($case.name + ': a returned quote was not an exact substring') }
    }
    if ($failures.Count -eq 0) { Write-Host ('PASS: ' + $case.name) -ForegroundColor Green }
}
if ($failures.Count -gt 0) {
    Write-Host 'Guardian rule tests FAILED:' -ForegroundColor Red
    $failures | ForEach-Object { Write-Host (' - ' + $_) }
    exit 1
}
Write-Host ('Guardian deterministic rule tests PASS: ' + $cases.Count + '/' + $cases.Count) -ForegroundColor Green