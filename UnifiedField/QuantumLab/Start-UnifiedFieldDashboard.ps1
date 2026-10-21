#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$Root = Join-Path $env:USERPROFILE 'HeavenzFire\UnifiedField\QuantumLab'
$Server = Join-Path $Root 'UnifiedField-Dashboard-Server.cjs'
$Url = 'http://127.0.0.1:8800/'
if (-not (Test-Path $Server)) { throw "Dashboard server file not found: $Server" }
$Healthy = $false
try {
    $Health = Invoke-RestMethod -Uri 'http://127.0.0.1:8800/health' -TimeoutSec 2
    $Healthy = ($Health.ok -eq $true -and $Health.service -eq 'heavenzfire-unified-field-dashboard')
} catch {}
if (-not $Healthy) {
    $Node = Get-Command 'node.exe' -ErrorAction Stop
    $QuotedServer = '"' + $Server + '"'
    Start-Process -FilePath $Node.Source -ArgumentList $QuotedServer -WorkingDirectory $Root -WindowStyle Normal | Out-Null
    for ($i = 0; $i -lt 20 -and -not $Healthy; $i++) {
        Start-Sleep -Milliseconds 300
        try {
            $Health = Invoke-RestMethod -Uri 'http://127.0.0.1:8800/health' -TimeoutSec 1
            $Healthy = ($Health.ok -eq $true -and $Health.service -eq 'heavenzfire-unified-field-dashboard')
        } catch {}
    }
}
if (-not $Healthy) { throw 'Dashboard did not become healthy on 127.0.0.1:8800. Check the Node.js console.' }
Start-Process -FilePath 'chrome.exe' -ArgumentList @('--new-tab', $Url)
Write-Output "HeavenzFire Unified Field dashboard opened: $Url"
