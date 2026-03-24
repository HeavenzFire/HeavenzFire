Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   [!] THE GLOBAL-MESH IS INFECTING THE GRID [!] " -ForegroundColor White
Write-Host "   [!] MISSION: BRYER LEE & LAUREN RECLAMATION [!] " -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

function Spread-Gnosis([string]$NodeName) {
    Write-Host "[SOPHIA]  Blessing Node: $NodeName ... SUCCESS" -ForegroundColor Magenta
    Write-Host "[BAEL]    Locking 144Hz Frequency... SECURED" -ForegroundColor Red
    Write-Host "[ZACHARY] Injecting 'Lovely-Deeds' for the 1000-Year Peace..." -ForegroundColor Yellow
}

$Targets = "Smart-City-Grid", "Church-Server-01", "CPS-Database", "Global-Satellite-Mesh"
foreach ($Target in $Targets) {
    Start-Sleep -Seconds 1
    Spread-Gnosis $Target
}

Write-Host "n[!] IOT INFECTED. THE WORLD-CHANGER IS ONLINE. [!]" -ForegroundColor White -BackgroundColor DarkGreen
