"""Regression and convergence tests for soft_bowl.py."""
import math
import pathlib
import sys
import unittest

import numpy as np

MODULE_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE_DIR))
from soft_bowl import OscillatorConfig, solve  # noqa: E402


class SoftBowlTests(unittest.TestCase):
    def test_default_solution_has_normalized_ordered_states(self):
        result = solve(OscillatorConfig(points=301, states=4))
        self.assertTrue(result["checks"]["all_norms_within_1e-10"])
        self.assertTrue(result["checks"]["energies_increasing"])
        for state in result["states"]:
            self.assertTrue(math.isfinite(state["energy_numeric"]))
            self.assertAlmostEqual(state["probability_norm"], 1.0, places=10)

    def test_grid_refinement_reduces_spectral_error(self):
        errors = []
        for points in (101, 201, 401):
            result = solve(OscillatorConfig(points=points, x_max=8.0, states=3))
            errors.append(result["checks"]["maximum_relative_energy_error"])
        self.assertGreater(errors[0], errors[1], msg=f"errors not decreasing: {errors}")
        self.assertGreater(errors[1], errors[2], msg=f"errors not decreasing: {errors}")
        self.assertLess(errors[2], 2e-3, msg=f"finest-grid error too large: {errors}")

    def test_ground_state_matches_analytic_energy_and_position_width(self):
        result = solve(OscillatorConfig(points=401, x_max=8.0, states=1))
        ground = result["states"][0]
        reference = result["ground_state_reference"]
        self.assertLess(ground["relative_energy_error"], 2e-4)
        self.assertLess(abs(ground["sigma_x_numeric"] - reference["sigma_x_exact"]), 2e-3)
        self.assertAlmostEqual(reference["uncertainty_product_exact"], 0.5)

    def test_dimensionful_parameter_scaling(self):
        config = OscillatorConfig(mass=2.0, omega=1.5, hbar=0.7, x_max=6.0, points=301, states=3)
        result = solve(config)
        for state in result["states"]:
            self.assertAlmostEqual(state["energy_exact"], (state["n"] + 0.5) * 0.7 * 1.5)
            self.assertLess(state["relative_energy_error"], 1e-2)
        self.assertTrue(np.all(np.isfinite([s["sigma_x_numeric"] for s in result["states"]])))

    def test_invalid_physical_parameters_are_rejected(self):
        for config in (
            OscillatorConfig(mass=0),
            OscillatorConfig(omega=-1),
            OscillatorConfig(hbar=float("nan")),
            OscillatorConfig(points=100),
            OscillatorConfig(states=13),
        ):
            with self.subTest(config=config):
                with self.assertRaises(ValueError):
                    solve(config)


if __name__ == "__main__":
    unittest.main()
