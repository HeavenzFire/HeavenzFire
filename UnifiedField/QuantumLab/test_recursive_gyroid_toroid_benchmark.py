import unittest

from recursive_gyroid_toroid_benchmark import benchmark, build_orders, invert_permutation


class RecursiveTopologyTests(unittest.TestCase):
    def test_orders_are_complete_permutations(self):
        for size in (1, 2, 7, 64, 257):
            for name, order in build_orders(size).items():
                self.assertEqual(len(order), size, name)
                self.assertEqual(sorted(order), list(range(size)), name)

    def test_inverse_permutation_restores_bytes(self):
        original = bytes((i * 37) % 256 for i in range(257))
        for order in build_orders(len(original)).values():
            encoded = bytes(original[i] for i in order)
            self.assertEqual(invert_permutation(encoded, order), original)

    def test_benchmark_requires_exact_round_trip_and_is_deterministic(self):
        data = (b"gyroid-toroid-fractal-topology-" * 23) + bytes(range(64))
        first = benchmark(data)
        second = benchmark(data)
        self.assertEqual(first["source_sha256"], second["source_sha256"])
        self.assertEqual(first["results"], second["results"])
        self.assertTrue(all(row["round_trip"] == "PASS" for row in first["results"]))
        self.assertEqual(first["winner"]["payload_bytes"],
                         min(row["payload_bytes"] for row in first["results"]))

    def test_empty_payload_is_rejected(self):
        with self.assertRaises(ValueError):
            benchmark(b"")


if __name__ == "__main__":
    unittest.main()
