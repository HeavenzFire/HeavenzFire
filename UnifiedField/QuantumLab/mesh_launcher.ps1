$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$DataDir = Join-Path $Root "data"
$Coord = Join-Path $PSScriptRoot "coordinator.py"
$Worker = Join-Path $PSScriptRoot "worker.py"
$Bridge = Join-Path $PSScriptRoot "dashboard_bridge.py"
$LogDir = Join-Path $PSScriptRoot "logs"

New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

# All four processes inherit the same fresh bearer token. It is not written to disk.
$TokenBytes = New-Object byte[] 32
$Rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $Rng.GetBytes($TokenBytes) } finally { $Rng.Dispose() }
$env:HEAVENZFIRE_TOKEN = [Convert]::ToBase64String($TokenBytes)

$Ports = @(8080,8081,18101,18102,18103)
foreach ($Port in $Ports) {
    $Existing = netstat -ano | Select-String (":" + $Port + "\s+.*LISTENING\s+(\d+)")
    if ($Existing) {
        throw "Port $Port is already listening. Stop the old mesh instance before launching a new one."
    }
}

Write-Host "=== HeavenzFire Mesh v0.1 ===" -ForegroundColor Cyan
py -3.12 --version
Write-Host "Shared in-memory worker authentication token generated." -ForegroundColor DarkGray

$Processes = @()
try {
    Write-Host "Starting coordinator on 127.0.0.1:8080..." -ForegroundColor Cyan
    $CoordProc = Start-Process -FilePath "py" -ArgumentList @("-3.12", $Coord) -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir "coordinator.stdout.log") -RedirectStandardError (Join-Path $LogDir "coordinator.stderr.log")
    $Processes += $CoordProc
    Start-Sleep -Seconds 2

    Write-Host "Starting loopback dashboard bridge on 127.0.0.1:8081..." -ForegroundColor Cyan
    $BridgeProc = Start-Process -FilePath "py" -ArgumentList @("-3.12", $Bridge) -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir "bridge.stdout.log") -RedirectStandardError (Join-Path $LogDir "bridge.stderr.log")
    $Processes += $BridgeProc
    Start-Sleep -Milliseconds 700

    foreach ($Port in @(18101,18102,18103)) {
        Write-Host "Starting authenticated worker on 127.0.0.1:$Port..." -ForegroundColor Cyan
        $Proc = Start-Process -FilePath "py" -ArgumentList @("-3.12", $Worker, "$Port") -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $LogDir "worker-$Port.stdout.log") -RedirectStandardError (Join-Path $LogDir "worker-$Port.stderr.log")
        $Processes += $Proc
        Start-Sleep -Milliseconds 700
    }

    Write-Host "--- Health checks ---" -ForegroundColor Cyan
    $Healthy = 0
    foreach ($Port in $Ports) {
        try {
            $Response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 4
            if ($Response.ok -eq $true) {
                Write-Host "Port $Port : HEALTHY" -ForegroundColor Green
                $Healthy++
            } else {
                Write-Host "Port $Port : BAD HEALTH RESPONSE" -ForegroundColor Red
            }
        } catch {
            Write-Host "Port $Port : FAILED - $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    if ($Healthy -ne 4) {
        throw "Mesh startup verification failed: $Healthy of 4 endpoints healthy. See logs under $LogDir."
    }

    Write-Host "Mesh coordinator and three workers are healthy. Keep this launcher running." -ForegroundColor Green
    while ($true) {
        Start-Sleep -Seconds 10
        foreach ($Proc in $Processes) {
            if ($Proc.HasExited) {
                throw "Mesh child process $($Proc.Id) exited with code $($Proc.ExitCode). Check logs under $LogDir."
            }
        }
    }
} finally {
    foreach ($Proc in $Processes) {
        if ($Proc -and -not $Proc.HasExited) {
            Stop-Process -Id $Proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item Env:HEAVENZFIRE_TOKEN -ErrorAction SilentlyContinue
}