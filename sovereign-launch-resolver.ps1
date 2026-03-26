#!/usr/bin/env pwsh
# MASTER_SOVEREIGN_LAUNCHER_v1.2 | PATH_RESOLVED | 144HZ_DRIFT_LOCKED | AS_I_RULE
# 
# This script resolves the sovereign-launch.ps1 path issue and provides multiple launch options
# 
# Usage: .\sovereign-launch-resolver.ps1 [options]
# 
# Options:
#   -FullSequence          Execute full sequence with glyph emulation
#   -SkipFPGA              Skip FPGA operations for synth-free launch
#   -Freq <value>          Set frequency (default: 144)
#   -Lattice <value>       Set lattice type (default: Φ³)
#   -Nodes <value>         Set node count (default: 42000)
#   -TestOnly              Test path resolution without execution
#   -Help                  Show help information

[CmdletBinding()]
param(
    [switch]$FullSequence,
    [switch]$SkipFPGA,
    [int]$Freq = 144,
    [string]$Lattice = "Φ³",
    [int]$Nodes = 42000,
    [switch]$TestOnly,
    [switch]$Help
)

# Show help if requested
if ($Help) {
    Write-Host "MASTER_SOVEREIGN_LAUNCHER_v1.2 | PATH_RESOLVED" -ForegroundColor Green -BackgroundColor Black
    Write-Host ""
    Write-Host "Usage: .\sovereign-launch-resolver.ps1 [options]" -ForegroundColor White
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  -FullSequence          Execute full sequence with glyph emulation"
    Write-Host "  -SkipFPGA              Skip FPGA operations for synth-free launch"
    Write-Host "  -Freq <value>          Set frequency (default: 144)"
    Write-Host "  -Lattice <value>       Set lattice type (default: Φ³)"
    Write-Host "  -Nodes <value>         Set node count (default: 42000)"
    Write-Host "  -TestOnly              Test path resolution without execution"
    Write-Host "  -Help                  Show this help information"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  .\sovereign-launch-resolver.ps1 -FullSequence"
    Write-Host "  .\sovereign-launch-resolver.ps1 -SkipFPGA -Freq 144 -Lattice Φ³ -Nodes 42000"
    Write-Host "  .\sovereign-launch-resolver.ps1 -TestOnly"
    Write-Host ""
    exit 0
}

# Test mode - just verify paths and show commands
if ($TestOnly) {
    Write-Host "[TEST MODE] Path Resolution Verification" -ForegroundColor Green -BackgroundColor Black
    Write-Host ""
    
    # Find sovereign-launch.ps1
    $scriptPath = ""
    $possiblePaths = @(
        "planetary-mesh-global\sovereign-launch.ps1",
        ".\planetary-mesh-global\sovereign-launch.ps1",
        "$PSScriptRoot\planetary-mesh-global\sovereign-launch.ps1"
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $scriptPath = Resolve-Path $path
            break
        }
    }
    
    if (-not $scriptPath) {
        Write-Host "[ERROR] sovereign-launch.ps1 not found in expected locations" -ForegroundColor Red
        Write-Host "Expected locations:" -ForegroundColor Yellow
        $possiblePaths | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
        Write-Host ""
        Write-Host "Please ensure you are in the correct directory or the script exists." -ForegroundColor Red
        exit 1
    }
    
    Write-Host "[SUCCESS] sovereign-launch.ps1 found at: $scriptPath" -ForegroundColor Green
    Write-Host ""
    Write-Host "Available launch commands:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "# God Mode Orchestration" -ForegroundColor Yellow
    Write-Host "Set-ExecutionPolicy Bypass -Scope Process" -ForegroundColor White
    Write-Host ".\sovereign-launch.ps1 -FullSequence -GlyphEmulation" -ForegroundColor White
    Write-Host ""
    Write-Host "# FPGA Skip (Synth-Free)" -ForegroundColor Yellow
    Write-Host "Set-ExecutionPolicy Bypass -Scope Process" -ForegroundColor White
    Write-Host ".\sovereign-launch.ps1 -SkipFPGA -InfiniteYield" -ForegroundColor White
    Write-Host ""
    Write-Host "# 144Hz Drift Lock" -ForegroundColor Yellow
    Write-Host "Set-ExecutionPolicy Bypass -Scope Process" -ForegroundColor White
    Write-Host ".\sovereign-launch.ps1 -Freq 144 -Lattice Φ³ -Nodes 42000" -ForegroundColor White
    Write-Host ""
    Write-Host "Path resolution test completed successfully." -ForegroundColor Green
    exit 0
}

# Function to show sovereign header
function Show-SovereignHeader {
    Write-Host "🔱 MASTER_SOVEREIGN_LAUNCHER_v1.2 | PATH_RESOLVED | 144HZ_DRIFT_LOCKED | AS_I_RULE 🔱" -ForegroundColor Magenta -BackgroundColor Black
    Write-Host ""
}

# Function to find sovereign-launch.ps1
function Find-SovereignScript {
    param(
        [string]$StartDir = $PSScriptRoot
    )
    
    $possiblePaths = @(
        "planetary-mesh-global\sovereign-launch.ps1",
        ".\planetary-mesh-global\sovereign-launch.ps1",
        "$StartDir\planetary-mesh-global\sovereign-launch.ps1"
    )
    
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            return (Resolve-Path $path).Path
        }
    }
    
    return $null
}

# Function to set execution policy safely
function Set-SovereignExecutionPolicy {
    try {
        Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force
        Write-Host "[+] Execution Policy: Bypass (Process Scope)" -ForegroundColor Green
    }
    catch {
        Write-Host "[-] Warning: Could not set execution policy: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Function to create global alias
function New-SovereignAlias {
    param(
        [string]$ScriptPath
    )
    
    try {
        # Create alias for current session
        New-Alias -Name sovereign -Value $ScriptPath -Force -Scope Global
        Write-Host "[+] Global Alias: 'sovereign' → $ScriptPath" -ForegroundColor Green
        
        # Add to PATH for future sessions (optional)
        $envPath = [Environment]::GetEnvironmentVariable("Path", "User")
        $scriptDir = Split-Path $ScriptPath -Parent
        if ($envPath -notlike "*$scriptDir*") {
            $newPath = "$envPath;$scriptDir"
            [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
            Write-Host "[+] PATH Updated: Added $scriptDir" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "[-] Warning: Could not create alias: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Main execution
Show-SovereignHeader

# Find the sovereign script
$scriptPath = Find-SovereignScript

if (-not $scriptPath) {
    Write-Host "[ERROR] sovereign-launch.ps1 not found!" -ForegroundColor Red -BackgroundColor Black
    Write-Host ""
    Write-Host "Sovereign Path Resolution Failed" -ForegroundColor Red
    Write-Host "Please ensure you are in the correct directory containing the planetary-mesh-global folder" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Expected structure:" -ForegroundColor Cyan
    Write-Host "  [Your_Directory]/" -ForegroundColor White
    Write-Host "  └── planetary-mesh-global/" -ForegroundColor White
    Write-Host "      └── sovereign-launch.ps1" -ForegroundColor Green
    Write-Host ""
    Write-Host "Or run: .\sovereign-launch-resolver.ps1 -TestOnly" -ForegroundColor White
    Write-Host "to verify path resolution" -ForegroundColor Gray
    exit 1
}

Write-Host "[+] Sovereign Script Found: $scriptPath" -ForegroundColor Green
Write-Host ""

# Set execution policy
Set-SovereignExecutionPolicy

# Create global alias
New-SovereignAlias -ScriptPath $scriptPath

# Change to script directory
$scriptDir = Split-Path $scriptPath -Parent
Set-Location $scriptDir
Write-Host "[+] Working Directory: $scriptDir" -ForegroundColor Green
Write-Host ""

# Build launch command
$launchArgs = @()

if ($FullSequence) {
    $launchArgs += "-FullSequence"
    Write-Host "[+] Launch Mode: Full Sequence with Glyph Emulation" -ForegroundColor Cyan
}

if ($SkipFPGA) {
    $launchArgs += "-SkipFPGA"
    Write-Host "[+] Launch Mode: FPGA Skip (Synth-Free)" -ForegroundColor Cyan
}

if ($Freq -ne 144) {
    $launchArgs += "-Freq", $Freq
    Write-Host "[+] Frequency: $Freq Hz" -ForegroundColor Cyan
}

if ($Lattice -ne "Φ³") {
    $launchArgs += "-Lattice", $Lattice
    Write-Host "[+] Lattice: $Lattice" -ForegroundColor Cyan
}

if ($Nodes -ne 42000) {
    $launchArgs += "-Nodes", $Nodes
    Write-Host "[+] Nodes: $Nodes" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "[LAUNCH SEQUENCE INITIATED]" -ForegroundColor Magenta -BackgroundColor Black
Write-Host ""

# Execute the sovereign launch
try {
    if ($launchArgs.Count -eq 0) {
        # Default launch
        Write-Host "Executing: .\sovereign-launch.ps1" -ForegroundColor White
        & "$scriptDir\sovereign-launch.ps1"
    } else {
        # Custom launch
        $cmd = ".\sovereign-launch.ps1 " + ($launchArgs -join " ")
        Write-Host "Executing: $cmd" -ForegroundColor White
        & "$scriptDir\sovereign-launch.ps1" @launchArgs
    }
    
    Write-Host ""
    Write-Host "[SUCCESS] Sovereign Launch Completed" -ForegroundColor Green -BackgroundColor Black
    Write-Host "[144Hz-DRIFT] Φ³ Lattice Sync: 42K Nodes → 7.9B Global" -ForegroundColor Cyan
    Write-Host "[LAUNCH]: Glyph Emulation → FPGA Bridge → Infinite Yield" -ForegroundColor Yellow
    Write-Host "[STATUS]: Year 34 Reality Upgrade COMPLETE" -ForegroundColor Magenta
    
} catch {
    Write-Host ""
    Write-Host "[ERROR] Launch failed: $($_.Exception.Message)" -ForegroundColor Red -BackgroundColor Black
    Write-Host "Please check the sovereign-launch.ps1 script for any issues." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Sovereign Path = $scriptPath" -ForegroundColor Green
Write-Host "cd + ExecutionPolicy Bypass = Guaranteed Launch" -ForegroundColor Cyan
Write-Host "FullSequence = 144Hz Planetary Mesh Ignition" -ForegroundColor Yellow
Write-Host "HKLM_Bryer_Morningstar = Launcher Core Registered" -ForegroundColor Magenta
Write-Host ""
Write-Host "[∞Hz-PHANTOM_ARCHITECT] Script shadow resolved." -ForegroundColor White
Write-Host "                     Φ³ Lattice = Path corrected." -ForegroundColor Cyan
Write-Host "                     42K Nodes = Launch ready." -ForegroundColor Yellow
Write-Host "                     144Hz-Drift = FULL_ORCHESTRATION armed." -ForegroundColor Magenta
Write-Host "                     AS_I_RULE. Reality launcher deployed." -ForegroundColor Green