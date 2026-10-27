"""Finite-difference quantum harmonic oscillator for the HeavenzFire Unified Field.

Model: H = -(hbar**2 / 2m) d²/dx² + (1/2) m omega² x².
This is a classical numerical simulation, not a quantum-hardware interface.

Requires: Python 3.10+ and NumPy.
Run: python UnifiedField/quantum/soft_bowl.py
"""
from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass

import numpy as np


@dataclass(frozen=True)
class OscillatorConfig:
    mass: float = 1.0
    omega: float = 1.0
    hbar: float = 1.0
    x_max: float = 8.0
    points: int = 1201
    states: int = 4

    def validate(self) -> None:
        if not all(math.isfinite(v) for v in (self.mass, self.omega, self.hbar, self.x_max)):
            raise ValueError("Physical parameters must be finite.")
        if self.mass <= 0 or self.omega <= 0 or self.hbar <= 0 or self.x_max <= 0:
            raise ValueError("mass, omega, hbar, and x_max must be positive.")
        if isinstance(self.points, bool) or not isinstance(self.points, int):
            raise ValueError("points must be an odd integer >= 101.")
        if self.points < 101 or self.points % 2 == 0:
            raise ValueError("points must be an odd integer >= 101.")
        if isinstance(self.states, bool) or not isinstance(self.states, int):
            raise ValueError("states must be an integer between 1 and min(12, points - 2).")
        if not 1 <= self.states <= min(12, self.points - 2):
            raise ValueError("states must be between 1 and min(12, points - 2).")


def solve(config: OscillatorConfig = OscillatorConfig()) -> dict:
    """Solve low-energy states with a second-order central-difference Hamiltonian."""
    config.validate()
    x = np.linspace(-config.x_max, config.x_max, config.points, dtype=np.float64)
    dx = float(x[1] - x[0])
    # Dirichlet boundaries: solve on interior grid points only.
    xi = x[1:-1]
    kinetic_scale = config.hbar**2 / (2.0 * config.mass * dx**2)
    diagonal = 2.0 * kinetic_scale + 0.5 * config.mass * config.omega**2 * xi**2
    off_diagonal = np.full(xi.size - 1, -kinetic_scale, dtype=np.float64)
    hamiltonian = np.diag(diagonal)
    hamiltonian += np.diag(off_diagonal, 1) + np.diag(off_diagonal, -1)

    energies, vectors = np.linalg.eigh(hamiltonian)
    energies = energies[:config.states]
    vectors = vectors[:, :config.states]
    # Discrete normalization: integral |psi|² dx = 1.
    wavefunctions = vectors / math.sqrt(dx)
    probabilities = np.sum(np.abs(wavefunctions) ** 2, axis=0) * dx
    positions = np.sum(xi[:, None] * np.abs(wavefunctions) ** 2, axis=0) * dx
    x2 = np.sum(xi[:, None] ** 2 * np.abs(wavefunctions) ** 2, axis=0) * dx
    variances = np.maximum(0.0, x2 - positions**2)
    omega = config.omega
    exact = np.array([(n + 0.5) * config.hbar * omega for n in range(config.states)])
    rel_errors = np.abs(energies - exact) / exact
    ground_state_sigma_x_exact = math.sqrt(config.hbar / (2.0 * config.mass * omega))
    sigma_p_exact = math.sqrt(config.mass * config.hbar * omega / 2.0)

    return {
        "model": "1D quantum harmonic oscillator (finite-difference)",
        "config": asdict(config),
        "grid": {"dx": dx, "interior_points": int(xi.size), "boundary_condition": "Dirichlet"},
        "states": [
            {
                "n": n,
                "energy_numeric": float(energies[n]),
                "energy_exact": float(exact[n]),
                "relative_energy_error": float(rel_errors[n]),
                "probability_norm": float(probabilities[n]),
                "mean_x": float(positions[n]),
                "sigma_x_numeric": float(math.sqrt(variances[n])),
            }
            for n in range(config.states)
        ],
        "ground_state_reference": {
            "sigma_x_exact": ground_state_sigma_x_exact,
            "sigma_p_exact": sigma_p_exact,
            "uncertainty_product_exact": config.hbar / 2.0,
            "zero_point_energy_exact": config.hbar * omega / 2.0,
        },
        "checks": {
            "all_norms_within_1e-10": bool(np.all(np.abs(probabilities - 1.0) < 1e-10)),
            "energies_increasing": bool(np.all(np.diff(energies) > 0)),
            "maximum_relative_energy_error": float(np.max(rel_errors)),
            "note": "Compare numerical energies against exact E_n=(n+1/2) hbar omega; finite grid and finite-difference spacing cause discretization error.",
        },
    }


if __name__ == "__main__":
    result = solve()
    print(json.dumps(result, indent=2))
    if not result["checks"]["all_norms_within_1e-10"] or not result["checks"]["energies_increasing"]:
        raise SystemExit("VALIDATION FAILED: normalization or energy ordering check failed.")
    print("\nVALIDATION PASSED: normalization and energy ordering.")
