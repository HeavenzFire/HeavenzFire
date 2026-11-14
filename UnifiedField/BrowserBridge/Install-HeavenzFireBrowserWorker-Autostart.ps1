#requires -Version 5.1
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'

$Launcher = Join-Path $PSScriptRoot 'Start-BrowserBridge.ps1'
if (-not (Test-Path -LiteralPath $Launcher)) {
    throw "BrowserBridge launcher not found: $Launcher"
}
$PowerShell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $PowerShell)) {
    throw "Windows PowerShell executable not found: $PowerShell"
}
$StartupFolder = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
if (-not (Test-Path -LiteralPath $StartupFolder)) {
    New-Item -ItemType Directory -Path $StartupFolder -Force | Out-Null
}
$StartupCommand = Join-Path $StartupFolder 'HeavenzFire-144A-BrowserBridge.cmd'
$RunLine = 'start "" "' + $PowerShell + '" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $Launcher + '"'
Set-Content -LiteralPath $StartupCommand -Value @('@echo off', $RunLine) -Encoding ASCII

$Saved = Get-Content -LiteralPath $StartupCommand -Raw
if ($Saved -notmatch [regex]::Escape($Launcher) -or $Saved -notmatch [regex]::Escape($PowerShell)) {
    throw 'Startup launcher verification failed.'
}
Write-Output 'AUTOSTART=INSTALLED'
Write-Output 'TRIGGER=Current user logon'
Write-Output 'PRIVILEGE=Current user, no elevation'
Write-Output ('STARTUP_FILE=' + $StartupCommand)
Write-Output 'REMOVE_FILE_TO_DISABLE=TRUE'