#requires -Version 5.1
[CmdletBinding()]
param([int]$TimeoutSec = 10)
$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Server = Join-Path $Root 'heavenzfire-mesh-bridge.cjs'
$Url = 'http://127.0.0.1:8081/health'
if (-not (Test-Path -LiteralPath $Server)) { throw "Mesh bridge entrypoint missing: $Server" }
$Healthy = $false
try { $Health = Invoke-RestMethod -Uri $Url -TimeoutSec 1; $Healthy = ($Health.ok -eq $true -and $Health.service -eq 'heavenzfire-local-mesh-bridge') } catch {}
if (-not $Healthy) {
    $Node = (Get-Command node.exe -ErrorAction Stop).Source
    Start-Process -FilePath $Node -ArgumentList @('"' + $Server + '"') -WorkingDirectory $Root -WindowStyle Normal | Out-Null
    $Deadline = (Get-Date).AddSeconds([Math]::Max(1, $TimeoutSec))
    while ((Get-Date) -lt $Deadline -and -not $Healthy) {
        Start-Sleep -Milliseconds 250
        try { $Health = Invoke-RestMethod -Uri $Url -TimeoutSec 1; $Healthy = ($Health.ok -eq $true -and $Health.service -eq 'heavenzfire-local-mesh-bridge') } catch {}
    }
}
if (-not $Healthy) { throw 'HeavenzFire mesh bridge did not become healthy on 127.0.0.1:8081.' }
Write-Output 'HEAVENZFIRE_MESH_BRIDGE=HEALTHY'
Write-Output ('QUEUE_SIZE=' + $Health.queue_size)