#requires -Version 5.1
[CmdletBinding()]
param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$Root = Join-Path $env:USERPROFILE 'HeavenzFire\UnifiedField\QuantumLab'
$MeshLauncher = Join-Path $Root 'Start-HeavenzFireMeshBridge.ps1'
if (-not (Test-Path -LiteralPath $MeshLauncher)) { throw "Mesh bridge launcher missing: $MeshLauncher" }
& $MeshLauncher
# Ensure the cognitive brain and loopback-only avatar vision worker are part of the same startup path.
$BrainServer = Join-Path $Root 'HeavenzFire-DigitalBrain-Server.cjs'
$BrainHealthy = $false
try { $BrainHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:8797/api/health' -TimeoutSec 2; $BrainHealthy = ($BrainHealth.ok -eq $true) } catch {}
if (-not $BrainHealthy) {
    if (-not (Test-Path -LiteralPath $BrainServer)) { throw "Digital Brain server missing: $BrainServer" }
    $Node = Get-Command 'node.exe' -ErrorAction Stop
    Start-Process -FilePath $Node.Source -ArgumentList ('"' + $BrainServer + '"') -WorkingDirectory $Root -WindowStyle Hidden | Out-Null
    for ($i = 0; $i -lt 20 -and -not $BrainHealthy; $i++) {
        Start-Sleep -Milliseconds 300
        try { $BrainHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:8797/api/health' -TimeoutSec 1; $BrainHealthy = ($BrainHealth.ok -eq $true) } catch {}
    }
}
if (-not $BrainHealthy) { throw 'Digital Brain did not become healthy on 127.0.0.1:8797.' }
$VisionScript = Join-Path $Root 'HeavenzFire-Avatar-Vision.py'
$VisionHealthy = $false
try { $VisionHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:11802/health' -TimeoutSec 2; $VisionHealthy = ($VisionHealth.ok -eq $true -and $VisionHealth.service -eq 'local-opencv-avatar-vision') } catch {}
if (-not $VisionHealthy) {
    if (-not (Test-Path -LiteralPath $VisionScript)) { throw "Avatar vision worker missing: $VisionScript" }
    $Python = 'C:\Python312\python.exe'
    if (-not (Test-Path -LiteralPath $Python)) { throw "Python 3.12 runtime missing: $Python" }
    Start-Process -FilePath $Python -ArgumentList ('"' + $VisionScript + '"') -WorkingDirectory $Root -WindowStyle Hidden | Out-Null
    for ($i = 0; $i -lt 20 -and -not $VisionHealthy; $i++) {
        Start-Sleep -Milliseconds 300
        try { $VisionHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:11802/health' -TimeoutSec 1; $VisionHealthy = ($VisionHealth.ok -eq $true -and $VisionHealth.service -eq 'local-opencv-avatar-vision') } catch {}
    }
}
if (-not $VisionHealthy) { throw 'Avatar vision worker did not become healthy on 127.0.0.1:11802.' }
$AvatarBodyServer = Join-Path (Split-Path $Root -Parent) 'AvatarBody\avatar-body-server.cjs'
$AvatarBodyUrl = 'http://127.0.0.1:8799/health'
$AvatarBodyHealthy = $false
try {
    $AvatarBodyHealth = Invoke-RestMethod -Uri $AvatarBodyUrl -TimeoutSec 2
    $AvatarBodyHealthy = ($AvatarBodyHealth.ok -eq $true -and $AvatarBodyHealth.service -eq 'heavenzfire-avatar-body')
} catch {}
if (-not $AvatarBodyHealthy) {
    if (-not (Test-Path -LiteralPath $AvatarBodyServer)) { throw "Avatar Body server missing: $AvatarBodyServer" }
    $Node = Get-Command 'node.exe' -ErrorAction Stop
    Start-Process -FilePath $Node.Source -ArgumentList ('"' + $AvatarBodyServer + '"') -WorkingDirectory (Split-Path $AvatarBodyServer -Parent) -WindowStyle Hidden | Out-Null
    for ($i = 0; $i -lt 20 -and -not $AvatarBodyHealthy; $i++) {
        Start-Sleep -Milliseconds 300
        try {
            $AvatarBodyHealth = Invoke-RestMethod -Uri $AvatarBodyUrl -TimeoutSec 1
            $AvatarBodyHealthy = ($AvatarBodyHealth.ok -eq $true -and $AvatarBodyHealth.service -eq 'heavenzfire-avatar-body')
        } catch {}
    }
}
if (-not $AvatarBodyHealthy) { throw 'Avatar Body did not become healthy on 127.0.0.1:8799.' }
Write-Output "Avatar Body service healthy: $AvatarBodyUrl"$Server = Join-Path $Root 'UnifiedField-Dashboard-Server.cjs'
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
if (-not $NoBrowser) { Start-Process -FilePath 'chrome.exe' -ArgumentList @('--new-tab', $Url) }
Write-Output "HeavenzFire Unified Field dashboard ready: $Url"