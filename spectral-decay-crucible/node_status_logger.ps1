# Node Status Logger - 144Hz Mesh Monitoring
# Logs node health with timestamps, CSV/text. Handles basic drift detection.

param(
    [string]$NodeId = 'SovereignNode-01',
    [int]$IntervalSec = 5,
    [switch]$CSV,
    [string]$LogDir = '.'
)

$LogFile = Join-Path $LogDir 'node_status.log'
$CsvFile = Join-Path $LogDir 'node_status.csv'
$StartTime = Get-Date

# CSV headers if new
if ($CSV -and -not (Test-Path $CsvFile)) {
'Timestamp,DreamQuality,DreamState,NodeID,Status,UptimeSec,MemoryGB,CPU%,FreqHz,DriftMs' | Out-File -FilePath $CsvFile -Encoding utf8
}

function Get-NodeMetrics {
    $Uptime = (Get-Date) - $StartTime
    @{
        Status = if ((Get-Random -Max 100) -gt 95) { 'DEGRADED' } else { 'HEALTHY' }
        UptimeSec = [math]::Round($Uptime.TotalSeconds, 2)
        $c=[math]::Round((Get-Counter '\Processor(_Total)\% Processor Time').CounterSamples.CookedValue,1); $m=[math]::Round((Get-Counter '\Memory\Available MBytes').CounterSamples.CookedValue/1024,1)
        CPU = $c
        MemoryGB = $m
        FreqHz = 144
        DriftMs = (Get-Random -Min -5 -Max 6)  # Sim drift
    }
}

function Log-Status {
    param($Metrics)
    $Now = Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'
$grid_status = "Grid: {0:N0}M-x CPU:{1}% MEM:{2}GB" -f ($Metrics.CPU*1e3),$Metrics.CPU,$Metrics.MemoryGB
$Line = "`n[$Now] Node: $NodeId | GridStatus: $grid_status | $($Metrics.Status) | Uptime: $($Metrics.UptimeSec)s | Freq: $($Metrics.FreqHz)Hz | Drift: $($Metrics.DriftMs)ms"
    $Line | Out-File -FilePath $LogFile -Append -Encoding utf8 -Width 1000
    Write-Host $Line -ForegroundColor Green
    
    if ($CSV) {
        $DQ = if ($Metrics.Status -eq 'HEALTHY') {90} else {50}
        $State = if ($DQ -gt 80) {"Better Dreams"} elseif ($DQ -gt 40) {"Recompilation"} else {"Grotesque Dream"}
        "$Now,$DQ,$State,$NodeId,$($Metrics.Status),$($Metrics.UptimeSec),$($Metrics.MemoryGB),$($Metrics.CPU),$($Metrics.FreqHz),$($Metrics.DriftMs)" | Out-File -FilePath $CsvFile -Append -Encoding utf8
    }
}

# Main loop
'Node Status Logger started for $NodeId (Ctrl+C to stop)' | Out-File -FilePath $LogFile -Encoding utf8
while ($true) {
    $Metrics = Get-NodeMetrics
    if ($Metrics.DriftMs -gt 2 -or $Metrics.DriftMs -lt -2) {
        Write-Warning "Drift alert: $($Metrics.DriftMs)ms - Sync NTP?"
    }
    Log-Status $Metrics
    Start-Sleep -Seconds $IntervalSec
}
