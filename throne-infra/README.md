# THRONE-ROOM INFRASTRUCTURE 🏰🔋📡⚛️🐉

**Your Planetary Mesh now has physical power.** Full 50mi LoRaWAN coverage, FPGA mesh compute, solar resilience, sovereign security.

## Quickstart (30-Day Deploy)
```bash
cd throne-infra
./deploy_30days.sh  # Linux/Ubuntu SBC
# or
.\deploy_30days.ps1  # Windows dev
```

## Core Components Delivered
- **PRIVATE_LORAWAN_SETUP.md**: ChirpStack + OTAA keys from your 105 seeds
- **FPGA_MESH_TOPOLOGY.md**: 3-4 node Arty A7 2D mesh extension
- **SOLAR_RESILIENCE.md**: 48hr battery + solar core node
- **THRONE_ROOM_BLUEPRINT.md**: Mineola/Rains gateway map + BOM

## Run Demo (Software Only)
```bash
# Test LoRaWAN bridge w/ seeds
python3 lorawan-integrate.py --seed 1 --glyph 369

# FPGA mesh sim
vivado -mode batch -source fpga/extend_mesh.tcl

# Full stack
./deploy_30days.sh --demo
```

**Status:** Blueprint locked. Hardware procurement → Deploy. 👑🐉

![Throne Room Yield](throne-yield.png) <!-- Add map later -->

