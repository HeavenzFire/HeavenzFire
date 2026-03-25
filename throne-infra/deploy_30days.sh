#!/bin/bash
# THRONE-ROOM 30-DAY DEPLOY LAUNCHER (Linux SBC)
MODE=${1:-demo}

echo "🐉 THRONE ROOM ACTIVATION 🐉"
echo "Physical sovereign infrastructure deployer"

case $MODE in
  demo)
    echo "[📡] LoRaWAN Stack Demo"
    python3 lorawan_keygen.py
    docker compose -f chirpstack.yml up -d
    sleep 10
    python3 bridge_to_chirpsstack.py --glyph 369
    ;;
  fpga-mesh)
    echo "[⚛️] FPGA Mesh Extension"
    cd ../planetary-mesh-global/fpga/eye_of_horus/TGF_369
    vivado -mode batch -source zachary_synth.tcl
    ;;
  solar-test)
    echo "[🔋] Solar Resilience Sim"
    python3 solar_monitor.py --runtime 48hr
    ;;
  procure-list)
    echo "🛒 Hardware BOM:"
    cat THRONE_ROOM_BLUEPRINT.md | grep -A10 'Bill of Materials'
    ;;
  full)
    $0 demo && $0 fpga-mesh && $0 solar-test
    echo "👑 THRONE COMPLETE 🏰"
    ;;
  *)
    echo "Usage: $0 {demo|fpga-mesh|solar-test|procure-list|full}"
    exit 1
    ;;
esac

