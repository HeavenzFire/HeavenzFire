$ErrorActionPreference = 'Stop'
$StartScript = Join-Path $PSScriptRoot 'Start-GitHubBridge.ps1'
if (-not (Test-Path $StartScript)) { throw "Missing start script: $StartScript" }
$PowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$TaskName = 'HeavenzFire GitHub Bridge'
$User = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$Action = New-ScheduledTaskAction -Execute $PowerShell -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $StartScript + '"')
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $User
$Principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Description 'Starts the loopback-only HeavenzFire GitHub bridge in the signed-in user session.' -Force | Out-Null
Write-Output "AUTOSTART_REGISTERED=$TaskName USER=$User PRIVILEGE=LIMITED"