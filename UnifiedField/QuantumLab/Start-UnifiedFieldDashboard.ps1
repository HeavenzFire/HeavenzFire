#requires -Version 5.1
$ErrorActionPreference = 'Stop'
$Root = Join-Path $env:USERPROFILE 'HeavenzFire\UnifiedField\QuantumLab'
$Server = Join-Path $Root 'UnifiedField-Dashboard-Server.cjs'
$Url = 'http://127.0.0.1:8800/'
if (-not (Test-Path $Server)) { throw "Dashboard server file not found: $Server" }
$AvatarServer = Join-Path (Split-Path $Root -Parent) 'AvatarBody\avatar-body-server.cjs'
$AvatarUrl = 'http://127.0.0.1:8799/health'
$AvatarHealthy = $false
if (Test-Path $AvatarServer) {
    try {
        $AvatarHealth = Invoke-RestMethod -Uri $AvatarUrl -TimeoutSec 2
        $AvatarHealthy = ($AvatarHealth.ok -eq $true -and $AvatarHealth.service -eq 'heavenzfire-avatar-body')
    } catch {}
    if (-not $AvatarHealthy) {
        try {
            $Node = Get-Command 'node.exe' -ErrorAction Stop
            $QuotedAvatarServer = '"' + $AvatarServer + '"'
            Start-Process -FilePath $Node.Source -ArgumentList $QuotedAvatarServer -WorkingDirectory (Split-Path $AvatarServer -Parent) -WindowStyle Normal | Out-Null
            for ($i = 0; $i -lt 20 -and -not $AvatarHealthy; $i++) {
                Start-Sleep -Milliseconds 300
                try {
                    $AvatarHealth = Invoke-RestMethod -Uri $AvatarUrl -TimeoutSec 1
                    $AvatarHealthy = ($AvatarHealth.ok -eq $true -and $AvatarHealth.service -eq 'heavenzfire-avatar-body')
                } catch {}
            }
        } catch {}
    }
    if ($AvatarHealthy) {
        Write-Output "Avatar Body service healthy: $AvatarUrl"
    } else {
        Write-Warning 'Avatar Body did not start. The dashboard will show the body as offline; existing services will not be stopped.'
    }
} else {
    Write-Warning "Avatar Body server file not found: $AvatarServer"
}
$VoiceServer = Join-Path (Split-Path $Root -Parent) 'Voice\voice-service.cjs'
$VoiceUrl = 'http://127.0.0.1:8796/health'
$VoiceHealthy = $false
if (Test-Path $VoiceServer) {
    try {
        $VoiceHealth = Invoke-RestMethod -Uri $VoiceUrl -TimeoutSec 2
        $VoiceHealthy = ($VoiceHealth.ok -eq $true -and $VoiceHealth.service -eq 'heavenzfire-voice-source-intake')
    } catch {}
    if (-not $VoiceHealthy) {
        try {
            $Node = Get-Command 'node.exe' -ErrorAction Stop
            $QuotedVoiceServer = '"' + $VoiceServer + '"'
            Start-Process -FilePath $Node.Source -ArgumentList $QuotedVoiceServer -WorkingDirectory (Split-Path $VoiceServer -Parent) -WindowStyle Normal | Out-Null
            for ($i = 0; $i -lt 20 -and -not $VoiceHealthy; $i++) {
                Start-Sleep -Milliseconds 300
                try {
                    $VoiceHealth = Invoke-RestMethod -Uri $VoiceUrl -TimeoutSec 1
                    $VoiceHealthy = ($VoiceHealth.ok -eq $true -and $VoiceHealth.service -eq 'heavenzfire-voice-source-intake')
                } catch {}
            }
        } catch {}
    }
    if ($VoiceHealthy) {
        Write-Output "Voice source intake healthy: $VoiceUrl"
    } else {
        Write-Warning 'Voice source intake did not start. Dashboard will continue without voice source status.'
    }
} else {
    Write-Warning "Voice source intake server not found: $VoiceServer"
}
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
