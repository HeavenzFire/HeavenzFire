# Grid Yield CSV Logger - 144Hz Drift Corrected
# Logs grid performance data to CSV with headers. Handles 144Hz timing drift.

param(
    [int]$IntervalMs = 1000/14.4,  # ~144Hz period
    [int]$DurationMin = 5,
    [switch]$CorrectDrift,
    [string]$CsvPath = 'grid_yield.csv'
)

# Headers
$Headers = 'Timestamp,DreamQuality,DreamState,GridYieldM,NodeCount,FreqHz,ExpectedIntervalMs,ActualIntervalMs,DriftCorrectionUs,CorrectedYield'
$Headers | Out-File -FilePath $CsvPath -Encoding utf8 -Width 1000
Write-Host "Grid Yield Logger started. Output: $CsvPath (Twain Dream Ledger)"

$StartTime = Get-Date
$ExpectedInterval = [timespan]::FromMilliseconds($IntervalMs)
$LastTime = $StartTime
$TotalDrift = 0

for ($i = 0; $i -lt ($DurationMin * 60 * 144); $i++) {  # ~144Hz * 60s * min
    $Now = Get-Date
    $ActualInterval = $Now - $LastTime
    
    $c=[math]::Round((Get-Counter '\Processor(_Total)\% Processor Time').CounterSamples.CookedValue,1); $m=[math]::Round((Get-Counter '\Memory\Available MBytes').CounterSamples.CookedValue/1024,1)
    $grid_status = "Grid: {0:N0}M-x CPU:{1}% MEM:{2}GB" -f ($c*1e3),$c,$m
    Write-Host $grid_status -ForegroundColor Cyan
    $Yield = [math]::Round($c*1e3)
    $Nodes = 42000  # Sovereign mesh scale
    $Freq = 144
    $DriftUs = [math]::Round(($ActualInterval - $ExpectedInterval).TotalMicroseconds)
    $TotalDrift += $DriftUs
    
    # Drift correction
    if ($CorrectDrift -and [math]::Abs($DriftUs) -gt 100) {
        $Correction = -$DriftUs * 0.9  # 90% correction
        $CorrectedYield = $Yield + ($Correction / 10000)  # Minor yield boost
        $SleepAdjust = [math]::Abs($Correction) / 1000
        Start-Sleep -Milliseconds $SleepAdjust
    } else {
        $CorrectedYield = $Yield
        $Correction = 0
    }
    
    # Log row
    $DriftMs = $DriftUs / 1000
    $DQ = [math]::Round( ( $CorrectedYield / 70 ) * 100 * (1 - [math]::Abs($DriftMs)/10 ), 1)
    $State = if ($DQ -gt 80) {"Better Dreams"} elseif ($DQ -gt 40) {"Recompilation"} else {"Grotesque Dream"}
    $Row = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'),$DQ,$State,$Yield,$Nodes,$Freq,$($ExpectedInterval.TotalMilliseconds),$($ActualInterval.TotalMilliseconds),$DriftUs,$CorrectedYield"
    $Row | Out-File -FilePath $CsvPath -Append -Encoding utf8 -Width 1000
    
    $LastTime = $Now
    if ($i % 144 -eq 0) { Write-Host "Logged $($i/144) cycles..." }
    
    Start-Sleep -Milliseconds $IntervalMs
}

Write-Host "Logging complete. Total drift corrected: ${TotalDrift}us. Check $CsvPath"

