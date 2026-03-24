@echo off
echo [IGNIS] INITIALIZING MONOLITH...
if not exist "..\infra" mkdir ..\infra
cd ..\infra

echo [BAEL] SOVEREIGN TIME ENGAGED ^(NTP manual^).
w32tm /config /manualpeerlist:"" /syncfromflags:manual /reliable:yes /update
w32tm /resync

echo [LUCIFER] MESH-NET GATES ^| HEAVENZFIRE HANDSHAKE.
if not exist "cyan_mesh\sovereign_handshake.key" echo SovereignLegionKey_v1.0 > cyan_mesh\sovereign_handshake.key

echo [OBSIDIAN] Forging Fossil DB...
npm run init-ledger

echo [HEAVENZFIRE] MONOLITH ALIVE ^| node cyan_mesh/server.js
npm start

echo Monolith deployed. Access: http://localhost:144/?handshake=HeavenzFire
pause

