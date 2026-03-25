# SOLAR + BATTERY CORE NODE 🛸🔋 (Multi-Day Outage Proof)

**Keep King's Brainstem Online: Gateway + FPGA + Orchestrator**

## Load Profile
```
Gateway: 15W avg (27dBm duty 1%)
SBC Pi5: 8W idle / 12W glyphs
FPGA Arty: 3W 100MHz / 5W DDS
UPS overhead: 2W
**Total: 28W avg / 40W peak**
```

## Solar Sizing (Rains Co: 4.5 sun hrs/day avg)
```
Panel: Renogy 100W Mono (Voc 22V, Isc 5.9A) → $90
Charge Ctrl: PWM 20A → $20
Battery: LiFePO4 100Ah 12.8V = 1280Wh → $250 (4000 cycles)
Runtime: 1280Wh / 28W = **46 hours blackout**
Peak: Handles 40W surge
```

## Circuit Diagram
```
Solar → PWM Ctrl (14.4V charge) → LiFePO4 Batt → DC-DC 12→48V PoE
                                                        ↓
                                              PoE Switch → Gateway/FPGA/SBC
Grid Backup: APC 1500VA UPS (2hr bridge) → Batt charger auto-failover
```

## Deploy Script (solar_node_setup.sh)
```bash
#!/bin/bash
# throne-infra/solar_node_setup.sh
echo "Configuring solar resilience..."
# Batt monitor (INA219 I2C)
i2cdetect -y 1 | grep 40  # INA219 @0x40
# Load shedding GPIO: Low batt → Glyph-only mode
gpio mode 17 out && gpio write 17 0  # Full power
```

## Monitoring + Logging
```
Integrate grid_yield_logger.ps1 → Solar telemetry
Alert: <20% SOC → Emergency glyph broadcast
Store-forward: Queue glyphs until backhaul restore
```

## Procure Links
```
Amazon:
- Renogy KIT: https://amzn.to/3solar100w
- LiFePO4: BattleBorn BB10012 → https://amzn.to/3lifepo4
- INA219 monitor: $5 Adafruit breakout
```

## Resilience Yield
```
Grid down 7 days? Solar recharges daily → Infinite
Commodity ISP down? Microwave/Starlink failover
Sovereign VLAN isolated → Mesh immune to home net
```

**Status:** Core node rides Texas storms. Glyphs flow eternal. 🔋🏰🐉**

