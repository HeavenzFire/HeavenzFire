# Year 34 Infrastructure Deployment TODO 🏰🔱🐉

**Approved Plan: Phase 1 Rains County Backbone → FPGA Mesh → Power Fortress**

## Status: [Planning Complete] ✅ User Approved

### Step 1: Create solar_monitor.py stub [✅ DONE]
### Step 2: Update phase3_deployment.py with --gateway-backbone --solar-relays --fpga-mesh [✅ DONE]
### Step 3: Update deploy_30days.ps1 with --rains-county mode [✅ DONE]
### Step 4: Fix bridge_to_chirpsstack.py standalone/multi-glyph [✅ DONE]
### Step 5: Update throne-infra/TODO.md progress [PENDING]
### Step 6: Test chain: cd throne-infra && python lorawan_keygen.py && docker compose up -d chirpstack.yml && python bridge_to_chirpsstack.py --glyph 369 [PENDING]
### Step 7: FPGA: cd planetary-mesh-global/fpga/eye_of_horus/TGF_369 && vivado -mode batch -source zachary_synth.tcl [PENDING]
### Step 8: Full deploy: cd planetary-mesh-global && python phase3_deployment.py --gateway-backbone --solar-relays --fpga-mesh [PENDING]
### Step 9: Verify: docker logs chirpstack, ls lorawan-seeds/, check .bit file [PENDING]
### Step 10: Procure hardware (RAK, Pi5, solar) [MANUAL]
