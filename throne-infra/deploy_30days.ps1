# THRONE-ROOM 30-DAY DEPLOY LAUNCHER 🏰🚀
param([string]$Mode = 'demo')

Write-Host '🐉 THRONE ROOM ACTIVATION SEQUENCE 🐉' -ForegroundColor Yellow
Write-Host 'Physical infrastructure for 50mi sovereign coverage' -ForegroundColor Green

if ($Mode -eq 'demo') {
    Write-Host "`n[📡] LoRaWAN Demo: Seed Join + Glyph Broadcast" -ForegroundColor Cyan
    python throne-infra/lorawan_keygen.py  # Gen OTAA keys
    docker-compose -f throne-infra/chirpstack.yml up -d
    Start-Sleep 10
    python throne-infra/bridge_to_chirpsstack.py --glyph 369
}

if ($Mode -eq 'fpga-mesh') {
    Write-Host "`n[⚛️] FPGA Mesh Synth + Deploy" -ForegroundColor Cyan
    cd planetary-mesh-global/fpga/eye_of_horus/TGF_369
    vivado -mode batch -source zachary_synth.tcl
    .\program_arty.tcl
}

if ($Mode -eq 'solar-test') {
    Write-Host "`n[🔋] Solar Autonomy Test" -ForegroundColor Cyan
    python throne-infra/solar_monitor.py --sim-48hr
}

if ($Mode -eq 'procure-list') {
    Write-Host "`n🛒 Amazon Procure List ~$2.5K:" -ForegroundColor Magenta
    Write-Host 'RAK Gateway: https://amzn.to/RAK7289'
    Write-Host 'Pi5: https://amzn.to/Pi5-8GB'
    Write-Host 'Solar Kit: https://amzn.to/Renogy100W'
}

if ($Mode -eq 'rains-county') {
    Write-Host "[👑] Rains County Backbone: Primary Gateway + 3 Relays + Core Server" -ForegroundColor Yellow
    .\deploy_30days.ps1 full
    Set-Location planetary-mesh-global
    python phase3_deployment.py --gateway-backbone --solar-relays --fpga-mesh
    Write-Host "`n🔱 YEAR34 INFRA: From 105 seeds to eternal mesh 🌀⚡" -ForegroundColor Green
}

if ($Mode -eq 'full') {
    .\deploy_30days.ps1 demo
    .\deploy_30days.ps1 fpga-mesh
    .\deploy_30days.ps1 solar-test
    Write-Host "`n👑 THRONE ROOM ONLINE | 50mi coverage + resilience 🏰🐉" -ForegroundColor Yellow
}

if ($Mode -eq '70m-full') {
    Write-Host "`n🔱 70M-X FINAL_FORM DEPLOY 🔱" -ForegroundColor Magenta
    docker swarm init --advertise-addr localhost
    docker stack deploy -c 70M_INFRA/docker-swarm.yml 70m-infra
    kubectl apply -f 70M_INFRA/glyph-autoscaler.yaml
    cd planetary-mesh-global/fpga/eye_of_horus/TGF_369
    vivado -mode batch -source ../../../../../throne-infra/70M_INFRA/chisel_synth_v3.tcl
    python ../../../../../throne-infra/70M_INFRA/70m_multiplier_optimizer.py --target 700m
    python ../../../../../throne-infra/70M_INFRA/qiskit_stub.py
    Write-Host "`n700M-x YIELD: Frameworks deployed. Multiplier optimized. AS_I_RULE eternal. 🛠️🔱👑🧮" -ForegroundColor Green
}

Write-Host "`nNext: procure gateways → mount rooftops → glyph multicast eternal.`n | Run: .\deploy_30days.ps1 --rains-county" -ForegroundColor White

