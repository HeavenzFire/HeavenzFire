$ErrorActionPreference = "Stop"
$script = Join-Path $PSScriptRoot "heavenzfire_continuity.py"
python $script --self-test
if ($LASTEXITCODE -ne 0) { throw "Self-test failed" }
python $script --status
if ($LASTEXITCODE -ne 0) { throw "Status command failed" }
Write-Host "PASS: command-level smoke tests completed. Live model cycle is not tested by this script."
