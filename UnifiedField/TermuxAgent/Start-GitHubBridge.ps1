$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Server = Join-Path $PSScriptRoot 'github-bridge-server.cjs'
$Port = 18798
if ([string]::IsNullOrWhiteSpace($env:HF_GITHUB_BRIDGE_READ_TOKEN) -or $env:HF_GITHUB_BRIDGE_READ_TOKEN.Length -lt 32) { throw 'HF_GITHUB_BRIDGE_READ_TOKEN must contain at least 32 characters before starting the bridge.' }
$Data = Join-Path $env:LOCALAPPDATA 'HeavenzFire\UnifiedField'
New-Item -ItemType Directory -Force -Path $Data | Out-Null
$Stdout = Join-Path $Data 'github-bridge.stdout.log'
$Stderr = Join-Path $Data 'github-bridge.stderr.log'
$listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  try { $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3; if ($health.service -eq 'heavenzfire-unified-field-github-bridge' -and $health.readAuthorizationConfigured -eq $true) { Write-Output "GITHUB_BRIDGE_ALREADY_RUNNING PID=$($listener.OwningProcess) HEALTH=PASS"; exit 0 } } catch {}
  throw "Port $Port is occupied by an unrelated process. No process was stopped."
}
& (Get-Command gh -ErrorAction Stop).Source auth status --hostname github.com *> $null
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI authentication is required.' }
$Node = (Get-Command node.exe -ErrorAction Stop).Source
$Process = Start-Process -FilePath $Node -ArgumentList @($Server) -WorkingDirectory $Root -PassThru -WindowStyle Hidden -RedirectStandardOutput $Stdout -RedirectStandardError $Stderr
for ($i = 0; $i -lt 20; $i++) { Start-Sleep -Seconds 1; try { $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2; if ($Health.ok -and $Health.service -eq 'heavenzfire-unified-field-github-bridge' -and $Health.readAuthorizationConfigured -eq $true) { Write-Output "GITHUB_BRIDGE=PASS PID=$($Process.Id) PORT=$Port AUTH=$($Health.githubAuth)"; exit 0 } } catch {}; if ($Process.HasExited) { break } }
if (Test-Path $Stderr) { Get-Content $Stderr -Tail 30 }
throw 'Bridge did not become healthy within 20 seconds.'