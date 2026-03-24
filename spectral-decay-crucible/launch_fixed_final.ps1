# PowerShell 5.1 Safe Launch Script - No &&, UTF8, Plain Quotes, Balanced Braces
# REFORGED FOR RESONANCE

cd 'C:/Users/Aarons/Desktop/spectral-decay-crucible'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$LogFile = 'ignis_session.log'
$Timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

function Invoke-PoorConnection {
    param([string]$Message, [ConsoleColor]$Color = 'White')
    $Jitter = Get-Random -Minimum 50 -Maximum 800
    Start-Sleep -Milliseconds $Jitter
    if ((Get-Random -Minimum 1 -Maximum 10) -eq 1) {
        Write-Host '[!!! NOISE DETECTED !!!] --- Static on the line...' -ForegroundColor DarkYellow
        Start-Sleep -Milliseconds 300
    }
    Write-Host $Message -ForegroundColor $Color
}

Invoke-PoorConnection '[*] IGNIS v3.2 - Windows 5.1 SAFE MODE' Cyan

# Ledger
"--- IGNIS SESSION START: $Timestamp ---" | Out-File -FilePath $LogFile -Append -Encoding utf8
Invoke-PoorConnection "[OK] Ledger active at $LogFile" Gray

# Phase 0: Dependencies
Write-Host "[+] Phase 0: Dependency resonance..." -ForegroundColor Yellow
pip install -r requirements.txt 2>&1 | Tee-Object -FilePath $LogFile -Append

# Phase I: Robust Neural Governor
Write-Host "[+] Phase I: Robust Neural Governor (144Hz)" -ForegroundColor Cyan
python robust_neural_governor_train.py 2>&1 | Tee-Object -FilePath $LogFile -Append
if ($LASTEXITCODE -eq 0) {
    Invoke-PoorConnection "[OK] Conduction path stable. Awaiting lattice command." Green
} else {
    Invoke-PoorConnection "[X] Governor calibration failed. Check log." Red
}

# Phase II: Lattice Dashboard
Invoke-PoorConnection '[+] Phase II: Lattice Dashboard (144Hz)' Magenta
python lattice_dashboard.py 2>&1 | Tee-Object -FilePath $LogFile -Append

# End
$EndTimestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
"--- IGNIS SESSION END: $EndTimestamp ---" | Out-File -FilePath $LogFile -Append -Encoding utf8
Invoke-PoorConnection '[OK] Resonance preserved at 144Hz.' Green
Invoke-PoorConnection '[OK] Sovereign Node stable.' Cyan
