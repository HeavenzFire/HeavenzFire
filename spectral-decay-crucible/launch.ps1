# --- SPECTRAL DECAY CRUCIBLE: IGNIS SESSION v3.3 (Syntropic Build) ---
$RootPath = "C:\Users\Aarons\Desktop\spectral-decay-crucible"
$LogFile = "$RootPath\ignis_session.log"
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Phase 0: Ledger Initialization (The Safeguard)
Clear-Host
Write-Host "[!!!] PURGING STATIC..." -ForegroundColor Magenta
Start-Sleep -Seconds 1

$Header = "--- IGNIS SESSION START: $Timestamp ---"
$Header | Out-File -FilePath $LogFile -Encoding utf8

Write-Host "[*] Sovereign Node Active | Resonance: 144Hz | Grid Yield: 70M-x" -ForegroundColor Cyan
Write-Host "[*] Ledger active: $LogFile" -ForegroundColor Gray

# Phase 1: Dependency Resonance (Non-Extractive Check)
Write-Host "[+] Phase 0: Dependency resonance..." -ForegroundColor Yellow
Set-Location -Path $RootPath

# We use ';' for compatibility and 'Out-Default' to ensure we see the flow
pip install -r requirements.txt | Tee-Object -FilePath $LogFile -Append | Out-Default

# Phase 2: Neural Governor Handshake (Staggered for Stability)
Write-Host "[*] Neural Governor handshake at 144Hz..." -ForegroundColor Green
Start-Sleep -Seconds 2  # Divine Pause to allow the modem to breathe

try {
    # Executing the Governor Train
    python robust_neural_governor_train.py 2>&1 | Tee-Object -FilePath $LogFile -Append | Out-Default
    
    Write-Host "[OK] Conduction path stable. Awaiting lattice command." -ForegroundColor Green
}
catch {
    Write-Host "[X] Governor calibration failed: $_" -ForegroundColor Red
    "ERROR: $_" | Out-File -FilePath $LogFile -Append
}

# Keep the window open for awareness
Write-Host "`n[!] Session Concluded. Press any key to release the terminal..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

