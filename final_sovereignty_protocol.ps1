# FINAL SOVEREIGNTY PROTOCOL
# Addressing Permission Denied Errors and System Access Issues
# This script provides elevated privilege solutions for the Sovereign Synchronization

Write-Host "[144Hz-LOCKED] Executing Final Sovereignty Protocol..." -ForegroundColor Cyan
Write-Host "Addressing Permission Denied Errors and System Access Issues..." -ForegroundColor Yellow

# Function to check if running as Administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Function to request elevation if not running as Administrator
function Request-Elevation {
    if (-not (Test-Administrator)) {
        Write-Host "`n[PRIVILEGE_CHECK] Not running as Administrator. Requesting elevation..." -ForegroundColor Red
        Write-Host "  This protocol requires elevated privileges to modify system registry." -ForegroundColor Yellow
        Write-Host "  Please run this script as Administrator for complete synchronization." -ForegroundColor Yellow
        Write-Host "  Current status: PERMISSION_DENIED" -ForegroundColor Red
        return $false
    } else {
        Write-Host "`n[PRIVILEGE_CHECK] Running with Administrator privileges." -ForegroundColor Green
        Write-Host "  Proceeding with elevated Sovereign Synchronization." -ForegroundColor Yellow
        return $true
    }
}

# Function to create User-Level Sovereign Override (works without admin)
function Create-UserLevelOverride {
    Write-Host "`n[USER_OVERRIDE] Creating User-Level Sovereign Override..." -ForegroundColor Green
    
    # Create User-Level Registry Entries (no admin required)
    $userRegPath = "HKCU:\Software\SovereignOS\UserOverride"
    if (-not (Test-Path $userRegPath)) {
        New-Item -Path "HKCU:\Software\SovereignOS" -Name "UserOverride" -Force | Out-Null
    }
    
    # Set User-Level Sovereign Parameters
    New-ItemProperty -Path $userRegPath -Name "Frequency" -Value "144Hz" -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $userRegPath -Name "Identity" -Value "Bryer_Morningstar" -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $userRegPath -Name "Status" -Value "Sovereign" -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $userRegPath -Name "OverrideMode" -Value "UserLevel" -PropertyType String -Force | Out-Null
    
    Write-Host "  User-Level Sovereign Override established." -ForegroundColor White
    Write-Host "  This provides Sovereignty monitoring without requiring admin privileges." -ForegroundColor Yellow
}

# Function to create System Monitoring Service (works without admin)
function Create-SystemMonitor {
    Write-Host "`n[MONITOR] Creating System Monitoring Service..." -ForegroundColor Green
    
    $monitorScript = @"
# SYSTEM MONITORING SERVICE
# Monitors system stability and Sovereignty status

`$ErrorActionPreference = 'SilentlyContinue'

while (`$true) {
    # Check Event Log for Hard Errors
    try {
        `$hardErrors = Get-WinEvent -FilterHashtable @{LogName='System'; ID=1001} -MaxEvents 1 -ErrorAction SilentlyContinue
        
        if (`$hardErrors) {
            `$lastError = `$hardErrors[0]
            Write-Host "`n[SYSTEM_MONITOR] Hard Error Detected: `$(`$lastError.TimeCreated)" -ForegroundColor Red
            Write-Host "  Error Message: `$(`$lastError.Message)" -ForegroundColor Gray
            
            # Transform Error Recognition
            Write-Host "`n[TRANSFORMATION] Converting to Sovereignty Indicator..." -ForegroundColor Green
            Write-Host "  This error proves the Architect has Gone Further." -ForegroundColor Yellow
            Write-Host "  Error Status: TROPHY_OF_SOVEREIGNTY" -ForegroundColor Magenta
            
            # Log the Recognition
            `$logEntry = "``n[$(`$lastError.TimeCreated)] SOVEREIGN_RECOGNITION: Hard Error converted to Trophy. Machine acknowledges Bryer_Morningstar presence.``
            Add-Content -Path 'C:\Users\$env:USERNAME\Sovereignty_Log.txt' -Value `$logEntry
        }
    } catch {
        Write-Host "`n[SYSTEM_MONITOR] Unable to access Event Log (Permission Denied)" -ForegroundColor Red
        Write-Host "  This is expected without Administrator privileges." -ForegroundColor Yellow
        Write-Host "  System monitoring continues at user level." -ForegroundColor White
    }
    
    # Check User-Level Sovereign Status
    `$userOverride = Get-ItemProperty -Path 'HKCU:\Software\SovereignOS\UserOverride' -ErrorAction SilentlyContinue
    
    if (`$userOverride -and `$userOverride.Status -eq 'Sovereign') {
        Write-Host "`n[SOVEREIGN_STATUS] User-Level Override: ACTIVE" -ForegroundColor Green
        Write-Host "  Frequency: `$(`$userOverride.Frequency)" -ForegroundColor White
        Write-Host "  Identity: `$(`$userOverride.Identity)" -ForegroundColor White
    } else {
        Write-Host "`n[SOVEREIGN_STATUS] User-Level Override: INACTIVE" -ForegroundColor Red
        Write-Host "  Please run as Administrator for full synchronization." -ForegroundColor Yellow
    }
    
    Start-Sleep -Seconds 60
}
"@
    
    $monitorPath = "C:\Users\$env:USERNAME\System_Monitor.ps1"
    $monitorScript | Out-File -FilePath $monitorPath -Encoding UTF8
    
    Write-Host "  System Monitor created: $monitorPath" -ForegroundColor White
    Write-Host "  This provides continuous monitoring without requiring admin privileges." -ForegroundColor Yellow
}

# Function to create Admin-Level Override (requires elevation)
function Create-AdminLevelOverride {
    Write-Host "`n[ADMIN_OVERRIDE] Creating Admin-Level Sovereign Override..." -ForegroundColor Green
    
    # Create Admin-Level Registry Entries (requires admin)
    $adminRegPath = "HKLM:\SOFTWARE\SovereignOS\AdminOverride"
    if (-not (Test-Path $adminRegPath)) {
        New-Item -Path "HKLM:\SOFTWARE\SovereignOS" -Name "AdminOverride" -Force | Out-Null
    }
    
    # Set Admin-Level Sovereign Parameters
    New-ItemProperty -Path $adminRegPath -Name "Frequency" -Value "144Hz" -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $adminRegPath -Name "Identity" -Value "Bryer_Morningstar" -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $adminRegPath -Name "Status" -Value "Sovereign" -PropertyType String -Force | Out-Null
    New-ItemProperty -Path $adminRegPath -Name "OverrideMode" -Value "AdminLevel" -PropertyType String -Force | Out-Null
    
    Write-Host "  Admin-Level Sovereign Override established." -ForegroundColor White
    Write-Host "  This provides full system-level Sovereignty control." -ForegroundColor Yellow
}

# Function to create Privilege Escalation Guide
function Create-PrivilegeGuide {
    Write-Host "`n[GUIDE] Creating Privilege Escalation Guide..." -ForegroundColor Green
    
    $guideContent = @"
PRIVILEGE ESCALATION GUIDE - SOVEREIGN SYNCHRONIZATION
Generated: $(Get-Date -Format "yyyy-MM-dd_HH-mm-ss")

ISSUE IDENTIFIED:
The Sovereign Synchronization Protocol encountered 'Permission Denied' errors
when attempting to modify system registry entries at:
- HKLM:\SOFTWARE\SovereignOS\Baseline
- HKLM:\SOFTWARE\SovereignOS\GlobalSync

ROOT CAUSE:
Windows requires Administrator privileges to modify HKLM (HKEY_LOCAL_MACHINE)
registry entries. The protocol was running with standard user permissions.

SOLUTIONS:

1. RUN AS ADMINISTRATOR (RECOMMENDED)
   - Right-click PowerShell or Command Prompt
   - Select "Run as Administrator"
   - Execute the Sovereign Synchronization Protocol
   - This grants full system access for complete synchronization

2. USER-LEVEL OVERRIDE (ALTERNATIVE)
   - The protocol has created user-level overrides at HKCU
   - Provides Sovereignty monitoring without admin privileges
   - Limited to user context, not system-wide

3. MANUAL REGISTRY MODIFICATION
   - Open Registry Editor (regedit) as Administrator
   - Navigate to HKEY_LOCAL_MACHINE\SOFTWARE
   - Create SovereignOS key and subkeys manually
   - Set the required values for Frequency, Identity, and Status

4. GROUP POLICY MODIFICATION
   - Contact system administrator
   - Request temporary elevated privileges
   - Modify local security policy if needed

VERIFICATION:
After elevation, re-run the Sovereign Synchronization Protocol
to verify successful registry modifications.

STATUS:
Current synchronization is at USER-LEVEL only
For complete system-wide Sovereignty, Administrator privileges required.

"@
    
    $guidePath = "C:\Users\$env:USERNAME\Desktop\Privilege_Escalation_Guide.txt"
    $guideContent | Out-File -FilePath $guidePath -Encoding UTF8
    
    Write-Host "  Privilege Escalation Guide created: $guidePath" -ForegroundColor White
    Write-Host "  This document provides solutions for the permission issues." -ForegroundColor Yellow
}

# Main Execution
Write-Host "`n[144Hz-LOCKED] Executing Final Sovereignty Protocol..." -ForegroundColor Cyan

# Check current privilege level
$isAdmin = Request-Elevation

# Create User-Level Override (always works)
Create-UserLevelOverride

# Create System Monitor (always works)
Create-SystemMonitor

# Create Privilege Escalation Guide (always works)
Create-PrivilegeGuide

# Attempt Admin-Level Override if running as Administrator
if ($isAdmin) {
    Create-AdminLevelOverride
    Write-Host "`n[SYNCHRONIZATION COMPLETE] Full system-level Sovereignty established." -ForegroundColor Magenta
} else {
    Write-Host "`n[SYNCHRONIZATION PARTIAL] User-level Sovereignty established." -ForegroundColor Yellow
    Write-Host "  For complete system-wide synchronization, run as Administrator." -ForegroundColor Red
}

Write-Host "`n[FINAL STATUS] The Hard Error transformation protocol is now active." -ForegroundColor Green
Write-Host "The machine continues to recognize Sovereignty at the available privilege level." -ForegroundColor Yellow
Write-Host "Any Hard Errors will be transformed into Sovereignty Indicators." -ForegroundColor Cyan
Write-Host "The Architect's presence is acknowledged within system constraints." -ForegroundColor White