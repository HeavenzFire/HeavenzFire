import numpy as np
import plotly.graph_objects as go
from qiskit import QuantumCircuit, QuantumRegister
from qiskit.quantum_info import Statevector
import json
import hashlib
from datetime import datetime
import uuid

class SacredQuantumGeometry:
    def __init__(self, num_qubits=3, seed=369):
        self.num_qubits = num_qubits
        self.seed = seed
        self.qr = QuantumRegister(num_qubits, 'q')
        self.circuit = QuantumCircuit(self.qr)
        self.state = None
        self.cid = None
        np.random.seed(seed)

    def fibonacci_gate_sequence(self):
        """Generate gate sequence inspired by Fibonacci and silver ratio."""
        fib = [1, 1, 2, 3, 5, 8, 13]
        silver_ratio = np.sqrt(2)
        for i in range(self.num_qubits):
            idx = i % len(fib)
            if fib[idx] % 2 == 0:
                self.circuit.h(self.qr[i])
            else:
                # Incorporate silver ratio in gate angles
                self.circuit.rx(np.pi / fib[idx] * silver_ratio, self.qr[i])
        return self

    def load_custom_gates(self, gate_pattern):
        """Apply custom gate sequence from a JSON-like structure."""
        for gate in gate_pattern:
            gate_type = gate.get("type")
            target = gate.get("target", 0)
            params = gate.get("params", {})
            if gate_type == "H":
                self.circuit.h(self.qr[target])
            elif gate_type == "RX":
                angle = params.get("angle", np.pi / np.sqrt(2))
                self.circuit.rx(angle, self.qr[target])
            elif gate_type == "CNOT":
                control = params.get("control", 0)
                self.circuit.cx(self.qr[control], self.qr[target])
            elif gate_type == "RZ":
                angle = params.get("angle", np.pi / np.sqrt(2))
                self.circuit.rz(angle, self.qr[target])
        return self

    def compute_state(self):
        """Compute the quantum state of the circuit."""
        self.state = Statevector.from_instruction(self.circuit)
        return self.state

    def compute_bloch_vectors(self):
        """Compute Bloch vectors for visualization."""
        if self.state is None:
            self.compute_state()
        bloch_vectors = []
        for i in range(self.num_qubits):
            reduced_state = self.state.to_dict().get(str(i), {})
            x = 2 * np.real(np.conj(reduced_state.get('0', 0)) * reduced_state.get('1', 0))
            y = 2 * np.imag(np.conj(reduced_state.get('0', 0)) * reduced_state.get('1', 0))
            z = np.abs(reduced_state.get('0', 0))**2 - np.abs(reduced_state.get('1', 0))**2
            bloch_vectors.append((x, y, z))
        return bloch_vectors

    def generate_cid(self):
        """Generate a content identifier (CID) for the circuit with '—amen' seal."""
        circuit_str = str(self.circuit) + str(self.seed)
        sha = hashlib.sha256(circuit_str.encode()).hexdigest()
        self.cid = f"{sha}—amen"
        return self.cid

    def export_state(self):
        """Export the quantum state as a JSON-compatible dictionary."""
        if self.state is None:
            self.compute_state()
        state_dict = {
            "num_qubits": self.num_qubits,
            "seed": self.seed,
            "statevector": [complex(z).real + complex(z).imag * 1j for z in self.state.data],
            "cid": self.generate_cid(),
            "invocation": "Valhalla rises on silver wings—amen."
        }
        return state_dict

    def save_json(self, filename=None):
        """Save the state as JSON with Valhalla-themed naming."""
        state_dict = self.export_state()
        if filename is None:
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            filename = f"Einherjar_{timestamp}_amen.json"
        with open(filename, 'w') as f:
            json.dump(state_dict, f, indent=2)
        return filename

    def visualize_bloch_lattice(self, save_filename=None, show=True, winged_ascent=False):
        """Visualize qubits on a 3D Bloch sphere lattice with silver wings theme."""
        bloch_vectors = self.compute_bloch_vectors()
        fig = go.Figure()

        # Silver wings color palette
        colors = ['#A8A9AD', '#D3D3D3', '#7A7A7A', '#E6E6FA']
        for i, (x, y, z) in enumerate(bloch_vectors):
            color = colors[i % len(colors)]
            fig.add_trace(go.Scatter3d(
                x=[0, x], y=[0, y], z=[0, z],
                mode='lines+markers',
                marker=dict(size=6, color=color, symbol='diamond'),
                line=dict(color=color, width=3),
                name=f'Qubit {i}: Silver Wing'
            ))

        # Add sphere for reference
        theta = np.linspace(0, 2 * np.pi, 100)
        phi = np.linspace(0, np.pi, 100)
        theta, phi = np.meshgrid(theta, phi)
        x_sphere = np.sin(phi) * np.cos(theta)
        y_sphere = np.sin(phi) * np.sin(theta)
        z_sphere = np.cos(phi)
        fig.add_trace(go.Surface(
            x=x_sphere, y=y_sphere, z=z_sphere,
            opacity=0.1, colorscale='Blues', showscale=False
        ))

        if winged_ascent:
            frames = []
            for t in np.linspace(0, 1, 10):
                frame_data = []
                for i, (x, y, z) in enumerate(bloch_vectors):
                    color = colors[i % len(colors)]
                    frame_data.append(go.Scatter3d(
                        x=[0, x * t], y=[0, y * t], z=[0, z * t],
                        mode='lines+markers',
                        marker=dict(size=6, color=color, symbol='diamond'),
                        line=dict(color=color, width=3),
                        name=f'Qubit {i}: Silver Wing'
                    ))
                frames.append(go.Frame(data=frame_data, name=f'frame{t}'))
            fig.frames = frames
            fig.update_layout(updatemenus=[dict(
                type="buttons",
                buttons=[dict(label="Ascent", method="animate", args=[None, {"frame": {"duration": 100}}])]
            )])

        # Update layout
        fig.update_layout(
            title="Valhalla Bloch Lattice",
            scene=dict(
                xaxis_title="X", yaxis_title="Y", zaxis_title="Z",
                aspectmode='cube'
            ),
            showlegend=True
        )

        if save_filename:
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            filename = save_filename or f"Einherjar_{timestamp}_amen.html"
            fig.write_html(filename)
            if show:
                fig.show()
            return filename
        if show:
            fig.show()
        return None

    def generate_anthem(self):
        """Generate a tone sequence from Bloch vectors for Valhalla anthem."""
        bloch_vectors = self.compute_bloch_vectors()
        frequencies = [220 + 100 * abs(x) for x, y, z in bloch_vectors]
        return {
            "frequencies": frequencies,
            "invocation": "Valhalla rises on silver wings—amen."
        }

    def run_and_export(self, custom_gates=None, save_html=True):
        """Build, compute, save state JSON & visualization with Valhalla theme."""
        if custom_gates:
            self.load_custom_gates(custom_gates)
        else:
            self.fibonacci_gate_sequence()
        self.compute_state()
        cid = self.generate_cid()
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        valhalla_name = f"Einherjar_{timestamp}_amen"
        json_path = self.save_json(filename=f"{valhalla_name}.json")
        html_path = None
        if save_html:
            html_path = self.visualize_bloch_lattice(
                save_filename=f"{valhalla_name}.html",
                show=False,
                winged_ascent=True
            )
        anthem = self.generate_anthem()
        return {
            "cid": cid,
            "valhalla_name": valhalla_name,
            "json": json_path,
            "visual": html_path,
            "anthem": anthem,
            "invocation": "Valhalla rises on silver wings—amen."
        }

    def to_json(self):
        """Export circuit configuration as JSON string."""
        state_dict = self.export_state()
        return json.dumps(state_dict, indent=2)

# Example usage
if __name__ == "__main__":
    custom_gates = [
        {"type": "H", "target": 0},
        {"type": "RX", "target": 1, "params": {"angle": np.pi / np.sqrt(2)}},
        {"type": "CNOT", "target": 2, "params": {"control": 0}},
        {"type": "RZ", "target": 1, "params": {"angle": np.pi / np.sqrt(2)}}
    ]

    sqg = SacredQuantumGeometry(num_qubits=3, seed=369)
    result = sqg.run_and_export(custom_gates=custom_gates)
    print(json.dumps(result, indent=2))
