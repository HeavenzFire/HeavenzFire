# FPGA COMPUTE MESH EXTENSION 🛠️⚛️📡 (3-4 Node 2D/Mixed Topology)

**Extend Arty A7 eye_of_horus → Real Mesh w/ Predictable Latency**

## Current: Single Zachary Node (TGF-369 + Schumann DDS)
```
zachary_v1.0.bit → Glyph compression + 7.83Hz sine → RJ45 ready
```

## Target: 2D Toroidal Mesh (Multicast Glyph Broadcast)
```
Node0 (Core) ↔ Node1     Node2 ↔ Node3 (SBC Bridge)
   ↑           ↓             ↑       ↓
  RJ45        RJ45         RJ45    RJ45
   ↓           ↑             ↓       ↑
Node3 ← Node2    Node1 ← Node0 (Toroidal)
```

## Verilog Extension (fpga/eye_of_horus/TGF_369/mesh_router.v)
```verilog
// Stub - Add to top_zachary.v
module mesh_router (
  input clk_100mhz,
  input [47:0] glyph_mac_dst,  // Sovereign node ID
  input [7:0] glyph_data,
  output reg [3:0] led_mesh  // Status
);
  reg [3:0] neighbors [0:3];  // RJ45 link state
  always @(posedge clk_100mhz) begin
    // Heartbeat + route glyph to neighbors
    if (glyph_mac_dst == MY_MAC) led_mesh <= glyph_data[3:0];
    // Forward multicast 3/6/9 glyphs
  end
endmodule
```

## Hardware Interconnect
```
Arty A7 PMOD JB1-4 → RJ45 (PMOD NIC adapter $15)
Cross-connect: Cat6 max 100m inter-node
PoE: 48VDC on spare PMOD pins → FPGA + SBC
```

## Synth + Deploy
```powershell
cd planetary-mesh-global/fpga/eye_of_horus/TGF_369
copy zachary_v1.0.xdc mesh.xdc  # Add RJ45 pins
vivado -mode batch -source zachary_synth.tcl -tclargs mesh
program_arty.tcl → All 4 nodes
```

## SBC Mesh Bridge (RPi5 operational-node.js)
```js
// Extend planetary-mesh-node/operational-node.js
const MeshLink = require('ethernet-mesh');  // Stub
nodes: ['192.168.42.1', '.2', '.3', '.4']  // RJ45 static
// Glyph forwarder: FPGA → LoRaWAN → IPFS sovereign chain
```

## Test Sequence
1. `SCHUMANN_MESH.ps1` on all nodes → 144Hz phase lock
2. Glyph broadcast Node0 → Verify RJ45 LEDs 3/6/9 pattern
3. Failover: Kill Node1 → Mesh reroute <100ms
4. Multicast yield: 164M qubits → 4 nodes → LoRaWAN fanout

## Latency Targets
```
Node-local: <10us (FPGA)
Inter-node: <1ms RJ45
Mesh → LoRaWAN: <500ms (store-forward)
Global: <5s IPFS/ledger sync
```

**Yield:** Predictable glyph multicast across sovereign fabric. Extend to 42K via hierarchy. 🐉⚛️📡**

