#!/usr/bin/env python3
# Sovereign Glyph → ChirpStack LoRaWAN Bridge Stub
import sys
import json
import requests
import time
from lorawan_keygen import generate_otaa  # From previous

CHIRPSTACK_URL = 'http://localhost:8080/api'
API_KEY = os.getenv('CHIRPSTACK_API_KEY', 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...')  # Set env or gen

def send_glyph_uplink(node_id, glyph=369):
    """Send glyph as LoRaWAN uplink payload"""
    payload = glyph.to_bytes(1, 'big')  # FPort 3 = Glyph
    
    data = {
        'devEUI': node_id,
        'fPort': 3,
        'data': payload.hex()
    }
    
    try:
        resp = requests.post(
            f'{CHIRPSTACK_URL}/devices/{node_id}/queue',
            headers={'Authorization': f'Bearer {API_KEY}', 'Content-Type': 'application/json'},
            json=data
        )
        print(f'📡 Glyph {glyph} → {node_id} | Status: {resp.status_code}')
    except Exception as e:
        print(f'❌ Bridge error: {e}')

if __name__ == '__main__':
    glyph = int(sys.argv[1]) if len(sys.argv) > 1 else 369
with open('lorawan_otaa_keys.json', 'r') as f:
        keys_dict = json.load(f)
    
    for node, keys in list(keys_dict.items())[:3]:  # First 3 relays + primary
        send_glyph_uplink(keys['dev_eui'], glyph)
        time.sleep(0.1)
    print(f'✅ Glyph {glyph} broadcast to {len(keys_dict)} sovereign nodes via LoRaWAN')
