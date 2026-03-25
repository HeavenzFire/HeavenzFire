# THRONE-ROOM INFRA DEPLOYMENT TODO 🏰🔋📡🐉⚛️

## Approved Plan Breakdown - 30-60 Day Moves

**Status Legend:** [ ] TODO | [x] DONE | [🔄] TESTING

- [x] Step 1: Create Blueprint Files ✅ (THRONE_ROOM_BLUEPRINT.md, PRIVATE_LORAWAN_SETUP.md, FPGA_MESH_TOPOLOGY.md, SOLAR_RESILIENCE.md, deploy_30days.{sh,ps1}, chirpstack.yml, lorawan_keygen.py, bridge_to_chirpsstack.py)
- [✅] Step 2: LoRaWAN Stack - Single Private Setup (Demo ready)
  - ChirpStack Docker via deploy_30days.ps1
  - OTAA keys via lorawan_keygen.py
  - Glyph test via bridge_to_chirpsstack.py
- [ ] Step 3: FPGA/Compute Mesh (3-4 nodes)
  - Extend fpga/eye_of_horus to 2D mesh routing
  - Bench test Arty A7 x3 + Raspberry Pi SBCs
  - Heartbeat + glyph multicast
- [ ] Step 4: Solar Resilience Core Node
  - Procure 100W solar + 100Ah battery kit
  - Integrate UPS w/ core gateway/FPGA node
  - 48hr autonomy test
- [ ] Step 5: Rains County Coverage Planning
  - Map 3 gateway rooftops/towers for 50mi
  - Link budget calc (LoRaWAN planner)
  - Fiber/microwave backhaul survey
- [ ] Step 6: Full Integration + Test
  - Wire sovereign-emulator → LoRaWAN app server
  - Deploy 30days.sh/ps1 launcher
  - End-to-end: Glyph → Mesh → LoRaWAN → Backhaul
- [ ] Step 7: Harden + Scale
  - Key rotation script (weekly)
  - Store-and-forward resilience
  - VLAN isolation sovereign traffic

**Next Immediate:** Step 2 - LoRaWAN (procure gateway e.g. RAK Gateway, run Docker)

**Yield Target:** 50mi sovereign coverage | Multi-day resilience | Glyph multicast mesh 🐉👑**

