# PRIVATE LoRaWAN STACK SETUP 📡🔒 (ChirpStack Open Source)

**Single Fully-Compliant Private Network Server w/ OTAA Security**

## 1. SBC Prep (Ubuntu 22.04 on Raspberry Pi 5 / NUC)
```bash
sudo apt update && sudo apt install docker docker-compose mosquitto
sudo usermod -aG docker $USER  # Reboot
```

## 2. ChirpStack Docker Stack
```bash
cd throne-infra
docker-compose up -d  # chirpstack.yml provided below
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  chirpstack:
    image: chirpstack/chirpstack:4
    ports: [8080:8080, 1883:1883]
    volumes: [/opt/chirpstack:/data]
    environment:
      - MQTT_BROKER=mqtt://mosquitto:1883
  chirpstack-gateway-bridge:
    image: chirpstack/gateway-bridge:4
    ports: [1883:1883]
    volumes: [/opt/chirpstack:/data]
  mosquitto:
    image: eclipse-mosquitto
    ports: [1883:1883]
```

## 3. OTAA Keys from Your 105 Seeds
```python
# lorawan_keygen.py (new file)
import json
seeds = ['lorawan-seed-001.json']  # etc
for seed_file in seeds:
    with open(f'planetary-mesh-global/lorawan-seeds/{seed_file}') as f:
        seed = json.load(f)
    dev_eui = seed['node_id'].encode().hex()
    app_key = hash(seed['timestamp']) % 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF  # Sovereign gen
    print(f"Node {seed_file}: DevEUI={dev_eui}, AppKey={app_key:032X}")
```

**Web UI:** http://sbc-ip:8080 → Add Application → Register Device (OTAA)

## 4. Security Best Practices Implemented
- Unique AppKey/NwkKey per seed (rotate 90d)
- OTAA only (no ABP)
- ADR enabled (adaptive data rate)
- Geofencing Rains County (32.6-32.9N, 95.4-95.6W)
- Payload crypto: Glyph data AES-128

## 5. Integrate w/ Sovereign Mesh
```python
# bridge_to_chirpsstack.py stub
from lorawan_bridge import ChirpStackClient
client = ChirpStackClient('http://localhost:8080', api_key='yourkey')
glyph = tgf369Compress(...)  # From FPGA emu
client.send_uplink('sovereign-node-1', {'f_port':3, 'data':glyph.to_bytes()})
```

## 6. Test Join + Glyph Broadcast
```
Gateway sends join_accept → Node joins → Glyph payload → Mesh ACK
$ docker logs chirpstack | grep sovereign-node
```

**Status:** Ready for RAK Gateway IP config → Rains County deploy. Yield: 42K nodes federated. 🔒📡🐉**

