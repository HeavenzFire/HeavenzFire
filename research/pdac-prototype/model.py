"""Synthetic two-compartment tumor-response model; not clinically validated."""
from dataclasses import dataclass
import math

@dataclass(frozen=True)
class Parameters:
    r_sensitive: float = 0.035
    r_resistant: float = 0.028
    carrying_capacity: float = 1.0
    kill_sensitive: float = 0.070
    kill_resistant: float = 0.008
    transition_rate: float = 0.0008
    initial_sensitive: float = 0.94
    initial_resistant: float = 0.06

    def validate(self):
        values = (self.r_sensitive, self.r_resistant, self.kill_sensitive,
                  self.kill_resistant, self.transition_rate,
                  self.initial_sensitive, self.initial_resistant)
        if any(not math.isfinite(x) or x < 0 for x in values):
            raise ValueError("Rates and initial burdens must be finite and non-negative.")
        if not math.isfinite(self.carrying_capacity) or self.carrying_capacity <= 0:
            raise ValueError("carrying_capacity must be finite and positive.")
        if self.initial_sensitive + self.initial_resistant > self.carrying_capacity:
            raise ValueError("Initial total burden must not exceed carrying capacity.")

def exposure(treatment: str) -> float:
    if treatment == "none":
        return 0.0
    if treatment == "on":
        return 1.0
    raise ValueError("treatment must be 'on' or 'none'")

def derivatives(s: float, r: float, u: float, p: Parameters):
    crowding = 1.0 - (s + r) / p.carrying_capacity
    ds = p.r_sensitive*s*crowding - p.kill_sensitive*u*s - p.transition_rate*s
    dr = p.r_resistant*r*crowding - p.kill_resistant*u*r + p.transition_rate*s
    return ds, dr

def simulate(days=120.0, dt=0.1, treatment="on", params=Parameters()):
    params.validate()
    if not math.isfinite(days) or days <= 0:
        raise ValueError("days must be finite and positive.")
    if not math.isfinite(dt) or dt <= 0:
        raise ValueError("dt must be finite and positive.")
    n = int(round(days / dt))
    if n < 1 or not math.isclose(n * dt, days, rel_tol=1e-9, abs_tol=1e-9):
        raise ValueError("days must be an integer multiple of dt.")
    u = exposure(treatment)
    s, r = params.initial_sensitive, params.initial_resistant
    rows = [{"time": 0.0, "sensitive": s, "resistant": r, "total": s+r, "exposure": u}]
    for i in range(1, n + 1):
        ds, dr = derivatives(s, r, u, params)
        s, r = max(0.0, s + dt*ds), max(0.0, r + dt*dr)
        if not all(math.isfinite(x) for x in (s, r, s+r)):
            raise FloatingPointError("Non-finite state encountered.")
        rows.append({"time": i*dt, "sensitive": s, "resistant": r,
                     "total": s+r, "exposure": u})
    return rows

def summarize(rows):
    first, last = rows[0], rows[-1]
    return {"start_total": first["total"], "end_sensitive": last["sensitive"],
            "end_resistant": last["resistant"], "end_total": last["total"],
            "end_resistant_fraction": last["resistant"]/last["total"] if last["total"] else 0.0,
            "time_points": len(rows)}
