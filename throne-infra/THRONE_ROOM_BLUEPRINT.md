# THRONE ROOM BLUEPRINT 🏰📡🔋⚛️🐉👑

**Physical Layer: 50+ Mile Sovereign Coverage in Rains County**

## Gateway Placement Map (Mineola Centric - 32.736°N, 95.495°W)
```
Gateway 1 (Core): Mineola Water Tower (32.736°N, 95.495°W) - 100ft AGL
  - Coverage: 25mi radius primary
  - Backhaul: Fiber to local exchange (or Starlink microwave)

Gateway 2: Point Rooftop (32.85°N, 95.60°W) - 15mi NE
  - Coverage: Overlap 80% + Northeast extension

Gateway 3: Yantis Silo (32.90°N, 95.55°W) - 20mi North
  - Coverage: Northern edge + failover redundancy

Total: Hexagonal layout, 50+ mi diameter, 99.9% redundancy
```

## Hardware Bill of Materials (BOM) - ~$2.5K Zero Budget Stretch
| Component | Model | Qty | Cost | Notes |
|-----------|--------|-----|------|-------|
| LoRaWAN Gateway | RAKwireless RAK7289C | 3 | $500ea | Indoor/Outdoor, SX1303, PoE, US915 |
| SBC Orchestrator | Raspberry Pi 5 8GB | 3 | $100ea | ChirpStack + sovereign protocols |
| FPGA Mesh Nodes | Arty A7-35T + RJ45 | 4 | $200ea | Extend eye_of_horus TGF-369 mesh |
| Solar Kit | Renogy 100W + 100Ah LiFePO4 | 1 | $400 | Core node 48hr autonomy |
| Backhaul | Ubiquiti NanoBeam (microwave) | 2 | $150ea | Gateway → Fiber handoff |
| Enclosure | NEMA 4X hardened | 3 | $100ea | Weatherproof, EMI shield |
| PoE Switch | TP-Link 8-port | 1 | $50 | Mesh + power distribution |

**Total Core:** $2,500 (scalable to 42K nodes)

## Link Budget Calc (US915 LoRaWAN)
```
TX Power: 27dBm (Gateway)
RX Sens: -137dBm (SF12 BW125)
Path Loss: 142dB max (50mi LOS 100ft AGL)
Margin: 12dB → Reliable glyph multicast
Duty Cycle: 1% compliant → Glyph priority queue
```

## Compute Layer: Mixed Mesh Topology
```
Node 0 (Core FPGA): Arty A7 zachary_v1.0.bit → RJ45 → Pi5
Node 1-3: Arty A7 + Pi5 SBC → Heartbeat/glyph broadcast
Topology: 2D toroidal mesh (low latency multicast)
Latency: <1ms inter-node, Schumann 144Hz phase lock
```

## Power Resilience Sizing
```
Daily Load: Gateway 15W + SBC 10W + FPGA 5W = 30W avg
Solar: 100W → 3+ sun hours TX (Rains Co avg)
Battery: 100Ah @ 12V = 1200Wh → 48hr full autonomy
UPS: CyberPower 1500VA → Grid flicker immunity
```

## GOLDEN_SHIELD UPS (Galvanic Isolation Layer)
**Problem:** Legacy grid surge could foreclose during deep-purge.
**Fix:** Electrical Island - Full galvanic isolation between Point_TX Core and grid.

| Component | Model | Qty | Cost | Notes |
|-----------|--------|-----|------|-------|
| Galvanic Isolator | ADuM4160 (iCoupler) | 4 | $5ea | RJ45 SPI/USB iso, 5kV |
| PoE Isolator | Silvertel AG9904M | 3 | $20ea | 60W PoE++, 2.5kV iso |
| Surge Protector | Tripp Lite ISOBAR8 | 1 | $100 | Zero ground contamination |

**Wiring:**
```
Grid AC → CyberPower UPS → Galvanic Iso → Solar Charge Ctrl → LiFePO4 → PoE Switch → Nodes
FPGA LoRaSPI → ADuM4160 → RPi GPIO (full iso)
```

**Yield:** Surge immunity, EMI shield, sovereign power domain. No legacy bleed. 🛡️⚡🏰


## Wiring to Existing Code
```
lorawan-seeds/*.json → ChirpStack OTAA keys (AppSKey, NwkSKey)
sovereign-emulator.js glyphs → LoRaWAN payload (glyph:3/6/9 + torque_vec)
phase3_deployment.py → Gateway health + yield telemetry
midnight-anchor.py → Daily 144Hz coherence pulse over LoRaWAN
```

**Procurement Priority:** RAK Gateways → Pi5 → Solar → Deploy!

**Next:** Run `deploy_30days.sh --procure-list` for Amazon links. 🐉👑**

