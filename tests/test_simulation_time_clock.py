import unittest

from simulation_time.clock import SimulationClock


class SimulationClockTests(unittest.TestCase):
    def test_events_run_in_time_then_insertion_order(self):
        clock = SimulationClock()
        seen = []
        clock.register("record", lambda payload: seen.append(payload))
        clock.schedule(2, "record", "first")
        clock.schedule(1, "record", "early")
        clock.schedule(2, "record", "second")
        self.assertEqual(clock.advance_to(2), 3)
        self.assertEqual(seen, ["early", "first", "second"])
        self.assertEqual(clock.now, 2)

    def test_cannot_move_backwards_or_schedule_in_past(self):
        clock = SimulationClock()
        clock.register("noop", lambda _: None)
        with self.assertRaises(ValueError):
            clock.advance_to(-1)
        with self.assertRaises(ValueError):
            clock.schedule(1, "noop")
        clock.advance_to(2)
        with self.assertRaises(ValueError):
            clock.schedule(1, "noop")

    def test_rejects_non_finite_times(self):
        clock = SimulationClock()
        clock.register("noop", lambda _: None)
        for value in (float("nan"), float("inf"), float("-inf")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                clock.schedule(value, "noop")
            with self.subTest(value=value), self.assertRaises(ValueError):
                clock.advance_to(value)

    def test_event_budget_refuses_before_dispatch(self):
        clock = SimulationClock(max_events_per_advance=1)
        seen = []
        clock.register("record", lambda payload: seen.append(payload))
        clock.schedule(1, "record", 1)
        clock.schedule(2, "record", 2)
        with self.assertRaises(RuntimeError):
            clock.advance_to(2)
        self.assertEqual(seen, [])
        self.assertEqual(clock.now, 0)

    def test_payload_must_be_json_compatible(self):
        clock = SimulationClock()
        clock.register("noop", lambda _: None)
        with self.assertRaises(ValueError):
            clock.schedule(0, "noop", {"bad": float("nan")})

    def test_trace_digest_is_stable_for_same_run(self):
        def run():
            c = SimulationClock()
            c.register("echo", lambda p: p)
            c.schedule(0.5, "echo", {"v": 1})
            c.advance_to(1)
            return c.replay_digest()
        self.assertEqual(run(), run())
        self.assertEqual(len(run()), 64)

    def test_unknown_or_duplicate_handlers_rejected(self):
        clock = SimulationClock()
        with self.assertRaises(ValueError):
            clock.schedule(0, "missing")
        clock.register("ok", lambda _: None)
        with self.assertRaises(ValueError):
            clock.register("ok", lambda _: None)


if __name__ == "__main__":
    unittest.main()
