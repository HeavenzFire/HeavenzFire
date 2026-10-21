#requires -Version 5.1
function Test-WorkerResponse {
    param([string]$Response)
    $issues = New-Object System.Collections.Generic.List[string]
    $warnings = New-Object System.Collections.Generic.List[string]
    $candidate = $Response.Trim()
    $fence = [string][char]96 + [string][char]96 + [string][char]96
    $candidate = $candidate.Replace($fence + 'json', '').Replace($fence + 'powershell', '').Replace($fence + 'PowerShell', '').Replace($fence, '').Trim()
    try { $doc = $candidate | ConvertFrom-Json -ErrorAction Stop }
    catch { return [pscustomobject]@{ passed=$false; issues=@('response_not_json'); warnings=@(); normalized_response='' } }

    foreach ($field in @('task','function_name','code','tests')) {
        if (-not ($doc.PSObject.Properties.Name -contains $field)) { $issues.Add('missing_field_' + $field) }
    }
    if ($doc.code -is [string]) {
        $trimmedCode = $doc.code.TrimEnd()
        if ($trimmedCode.EndsWith('.')) {
            $doc.code = $trimmedCode.Substring(0, $trimmedCode.Length - 1).TrimEnd()
            $warnings.Add('trimmed_terminal_period_from_code')
        }
    }
    if (-not ($doc.code -is [string]) -or $doc.code -notmatch '(?is)function\s+Get-SumSafe\b') { $issues.Add('function_definition_missing') }
    if ($doc.code -notmatch '(?is)foreach\s*\(\s*\$\w+\s+in\s+\$InputValues\s*\)') { $issues.Add('input_iteration_not_verified') }
    if ($doc.code -notmatch '(?is)\$\w+\s*\+=\s*\$\w+') { $issues.Add('accumulator_not_verified') }
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseInput([string]$doc.code, [ref]$tokens, [ref]$parseErrors) | Out-Null
    if ($parseErrors.Count -gt 0) { $issues.Add('powershell_parse_failed') }

    if ($doc.tests -isnot [System.Array] -or $doc.tests.Count -ne 2) {
        $issues.Add('tests_schema_invalid')
    } else {
        foreach ($case in $doc.tests) {
            $inputValues = $case.input
            if ($inputValues -is [string]) {
                try {
                    $parsedInput = ConvertFrom-Json -InputObject $inputValues -ErrorAction Stop
                    if ($parsedInput -is [System.Array]) {
                        $inputValues = @($parsedInput)
                        $case.input = $inputValues
                        $warnings.Add('parsed_json_array_from_string')
                    } else {
                        $issues.Add('test_case_schema_invalid')
                        continue
                    }
                } catch {
                    $issues.Add('test_case_schema_invalid')
                    continue
                }
            }
            if ($null -eq $inputValues -or $inputValues -isnot [System.Array] -or $null -eq $case.expected_output) {
                $issues.Add('test_case_schema_invalid')
                continue
            }
            $sum = 0.0
            $validInputs = $true
            foreach ($value in $inputValues) {
                $number = 0.0
                if (-not [double]::TryParse([string]$value, [ref]$number)) { $validInputs = $false; break }
                $sum += $number
            }
            $expected = 0.0
            if (-not $validInputs -or -not [double]::TryParse([string]$case.expected_output, [ref]$expected)) {
                $issues.Add('test_case_values_invalid')
            } elseif ($sum -ne $expected) {
                $issues.Add('test_expected_output_mismatch')
            }
        }
    }
    return [pscustomobject]@{
        passed=($issues.Count -eq 0)
        issues=@($issues.ToArray())
        warnings=@($warnings.ToArray())
        normalized_response=($doc | ConvertTo-Json -Depth 8 -Compress)
    }
}