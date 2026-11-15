#requires -Version 5.1
$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
$Server=Join-Path $Root 'bridge-server.cjs'
$Node=(Get-Command node.exe -ErrorAction Stop).Source
$Url='http://127.0.0.1:18795/health'
try { $h=Invoke-RestMethod -Uri $Url -TimeoutSec 2; if($h.service -eq 'HeavenzFire-144A-BrowserBridge'){Write-Host "144A BrowserBridge already healthy: $Url" -ForegroundColor Green; exit 0} } catch {}
$existing=@(netstat.exe -ano | Select-String -SimpleMatch ':18795' | Where-Object { $_.Line -match '\sLISTENING\s' })
if($existing.Count -gt 0){throw 'Port 18795 is occupied by another service; refusing to start a duplicate.'}
$proc=Start-Process -FilePath $Node -ArgumentList @('"' + $Server + '"') -WorkingDirectory $Root -WindowStyle Hidden -PassThru
for($i=0;$i -lt 20;$i++){Start-Sleep -Milliseconds 250;try{$h=Invoke-RestMethod -Uri $Url -TimeoutSec 2;if($h.service -eq 'HeavenzFire-144A-BrowserBridge'){Write-Host "144A BrowserBridge online at http://127.0.0.1:18795/" -ForegroundColor Green;Write-Host "PID: $($proc.Id)";exit 0}}catch{}}
throw '144A BrowserBridge did not become healthy. Inspect its process and Node.js availability.'