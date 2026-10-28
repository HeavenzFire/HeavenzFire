import math
import unittest
from model import Parameters, simulate, summarize

class ModelTests(unittest.TestCase):
    def test_zero_growth_is_constant(self):
        p = Parameters(r_sensitive=0, r_resistant=0, kill_sensitive=0,
                       kill_resistant=0, transition_rate=0,
                       initial_sensitive=0.5, initial_resistant=0.2)
        rows = simulate(10, 0.1, "none", p)
        self.assertTrue(all(abs(row["total"] - 0.7) < 1e-12 for row in rows))

    def test_state_is_finite_and_nonnegative(self):
        for row in simulate():
            for key in ("sensitive", "resistant", "total"):
                self.assertGreaterEqual(row[key], 0)
                self.assertTrue(math.isfinite(row[key]))

    def test_repeat_is_deterministic(self):
        self.assertEqual(simulate(10, 0.1, "on"), simulate(10, 0.1, "on"))

    def test_synthetic_treatment_endpoint_below_control(self):
        treated = summarize(simulate(120, 0.1, "on"))
        control = summarize(simulate(120, 0.1, "none"))
        self.assertLess(treated["end_total"], control["end_total"])

    def test_resistant_fraction_shifts_in_synthetic_example(self):
        rows = simulate(120, 0.1, "on")
        initial = rows[0]["resistant"] / rows[0]["total"]
        final = rows[-1]["resistant"] / rows[-1]["total"]
        self.assertGreater(final, initial)

    def test_step_size_sensitivity(self):
        coarse = simulate(20, 0.1, "on")[-1]["total"]
        fine = simulate(20, 0.05, "on")[-1]["total"]
        self.assertLess(abs(coarse - fine), 0.002)

    def test_invalid_step_rejected(self):
        with self.assertRaises(ValueError):
            simulate(10, 0, "on")

if __name__ == "__main__":
    unittest.main()
