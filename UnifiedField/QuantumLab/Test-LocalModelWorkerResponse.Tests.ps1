#requires -Version 5.1
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Test-LocalModelWorkerResponse.ps1')

$valid = @'
{"task":"Get-SumSafe","function_name":"Get-SumSafe","code":"function Get-SumSafe { param([int[]]$InputValues) $sum = 0; foreach ($value in $InputValues) { $sum += $value }; return $sum }","tests":[{"input":[1,2,3],"expected_output":6},{"input":[-1,-2,-3],"expected_output":-6}]}
'@
$result = Test-WorkerResponse -Response $valid
if (-not $result.passed) { throw ('valid fixture rejected: ' + ($result.issues -join ',')) }
if ($result.warnings.Count -ne 0) { throw 'valid fixture should not require normalization' }

$normalizable = @'
{"task":"Get-SumSafe","function_name":"Get-SumSafe","code":"function Get-SumSafe { param([int[]]$InputValues) $sum = 0; foreach ($value in $InputValues) { $sum += $value }; return $sum }.","tests":[{"input":"[1,2,3]","expected_output":6},{"input":"[-1,-2,-3]","expected_output":-6}]}
'@
$normalized = Test-WorkerResponse -Response $normalizable
if (-not $normalized.passed) { throw ('normalizable fixture rejected: ' + ($normalized.issues -join ',')) }
if ($normalized.warnings.Count -ne 2) { throw ('expected two normalization warnings, got ' + $normalized.warnings.Count) }
$normalizedDoc = $normalized.normalized_response | ConvertFrom-Json
if ($normalizedDoc.tests[0].input -isnot [System.Array]) { throw 'normalized input was not converted to an array' }
if ($normalizedDoc.code.TrimEnd().EndsWith('.')) { throw 'terminal punctuation was not removed from normalized code' }

$badExpected = $valid.Replace('"expected_output":6','"expected_output":7')
$badMath = Test-WorkerResponse -Response $badExpected
if ($badMath.passed -or $badMath.issues -notcontains 'test_expected_output_mismatch') { throw 'incorrect arithmetic expectation was not rejected' }

$badSyntax = @'
{"task":"Get-SumSafe","function_name":"Get-SumSafe","code":"function Get-SumSafe {","tests":[{"input":[1,2,3],"expected_output":6},{"input":[-1,-2,-3],"expected_output":-6}]}
'@
$syntax = Test-WorkerResponse -Response $badSyntax
if ($syntax.passed -or $syntax.issues -notcontains 'powershell_parse_failed') { throw 'invalid PowerShell syntax was not rejected' }

$prose = Test-WorkerResponse -Response 'Here is a function, with no JSON contract.'
if ($prose.passed -or $prose.issues -notcontains 'response_not_json') { throw 'non-JSON model response was not rejected' }

Write-Output 'VALIDATOR_TESTS=PASS (5 scenarios; no generated code executed)'
