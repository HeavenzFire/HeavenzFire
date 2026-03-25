#!/usr/bin/env python3
import json
import os
import hashlib
import sys
from pathlib import Path

# Generate OTAA keys from existing lorawan-seeds
def generate_otaa(seed_file):
    path = Path('planetary-mesh-global/lorawan-seeds') / seed_file
    if not path.exists():
        print(f'❌ Seed not found: {path}')
        return None
    
    with open(path) as f:
        seed = json.load(f)
    
    # Sovereign key gen from timestamp + node_id
    seed_str = f"{seed['node_id']}{seed['timestamp']}".encode()
    dev_eui = hashlib.sha256(seed_str).hexdigest()[:16].upper()
    app_key = hashlib.sha256(seed_str + b'sovereign').hexdigest()[:32].upper()
    nwk_key = hashlib.sha256(seed_str + b'network').hexdigest()[:32].upper()
    
    print(f"Node: {seed_file}")
    print(f"  DevEUI: {dev_eui}")
    print(f"  AppKey: {app_key}")
    print(f"  NwkKey: {nwk_key}")
    print(f"  Location: {seed['location']}")
    print()
    
    return {
        'dev_eui': dev_eui,
        'app_key': app_key,
        'nwk_key': nwk_key,
        'freq': seed['freq']
    }

if __name__ == '__main__':
    seeds_dir = Path('planetary-mesh-global/lorawan-seeds')
    seeds = [f for f in seeds_dir.glob('lorawan-seed-*.json')][:5]  # First 5 demo
    
    keys = {}
    for seed in seeds:
        key_data = generate_otaa(seed.name)
        if key_data:
            keys[seed.stem] = key_data
    
    # Save to ChirpStack import
    with open('lorawan_otaa_keys.json', 'w') as f:
        json.dump(keys, f, indent=2)
    print("✅ OTAA keys saved: lorawan_otaa_keys.json")

