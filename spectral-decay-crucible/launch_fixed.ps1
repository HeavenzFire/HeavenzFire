# ==============================================================================
# IGNIS SOVEREIGN CONDUCTOR v3.2 FIXED (Poor Connection Edition - Balanced Braces)
# ==============================================================================

$ProjectRoot = Get-Location
$LogFile = Join-Path $ProjectRoot "ignis_session.log"
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# --- SIMULATING IMPEDANCE ---
Function Invoke-PoorConnection {
    param([string]$Message, [ConsoleColor]$Color = 'White')
    $Jitter = Get-Random -Minimum 50 -Maximum 800
    Start-Sleep -Milliseconds $Jitter
    if ((Get-Random -Minimum 1 -Maximum 10) -eq 1) {
        Write-Host "[!!! NOISE DETECTED !!!] --- Static on the line..." -ForegroundColor DarkYellow
        Start-Sleep -Milliseconds 300
    }
    Write-Host $Message -ForegroundColor $Color
}

Invoke-PoorConnection "[*] Ignition - V3.2 FIXED" Cyan

# === VENV GROUNDING (FIXED BRACES) ===
$VenvPath = Join-Path $PSScriptRoot ".venv"

if (Test-Path "$VenvPath\Scripts\Activate.ps1") {
    Invoke-PoorConnection "[144Hz-VENV] Local ground detected. Activating..." Cyan
    &amp; "$VenvPath\Scripts\Activate.ps1"
    $env:IGNIS_VENV_ACTIVE = "true"
} else {
    Invoke-PoorConnection "[144Hz-VENV] No local ground. Global grid." Yellow
    if (!(Get-Command python -ErrorAction SilentlyContinue)) {
        Invoke-PoorConnection "[144Hz-CRITICAL] No Python. Aborting." Red
        exit 1
    }
} # inner if closed
# === END VENV ===

# Logging
"--- IGNIS START: $Timestamp ---" | Out-File -FilePath $LogFile -Append -Encoding utf8
Invoke-PoorConnection "[*] Logging: $LogFile" Gray

# Deps
Invoke-PoorConnection "[+] Dependencies..." Yellow
pip install -r requirements.txt 2>&amp;1 | Tee-Object -FilePath $LogFile -Append

# Calibration
Invoke-PoorConnection "[+] PHASE I: Neural Governor..." Magenta
$modelPath = "$ProjectRoot\neural_governor.pt"
if (-not (Test-Path $modelPath)) {
    python robust_neural_governor_train.py 2>&amp;1 | Tee-Object -FilePath $LogFile -Append
    if ($LASTEXITCODE -ne 0) {
        Invoke-PoorConnection "[X] Calibration fail." Red
        exit $LASTEXITCODE
    }
} else {
    Invoke-PoorConnection "[✓] Governor ready." Cyan
}

# Resonance
Invoke-PoorConnection "[+] PHASE II: Lattice Dashboard (144Hz)" Magenta
python lattice_dashboard.py 2>&amp;1 | Tee-Object -FilePath $LogFile -Append

# Cool down
$EndTimestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"--- IGNIS END: $EndTimestamp ---`n" | Out-File -FilePath $LogFile -Append -Encoding utf8

Invoke-PoorConnection "[✓] Complete. Resonance preserved." Green
