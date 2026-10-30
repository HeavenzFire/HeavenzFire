import argparse
import csv
import json
import platform
from pathlib import Path
from model import Parameters, simulate, summarize

def run(out, days, dt, treatment):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    params = Parameters()
    rows = simulate(days=days, dt=dt, treatment=treatment, params=params)
    with (out / "trajectory.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    control = summarize(simulate(days=days, dt=dt, treatment="none", params=params))
    summary = summarize(rows)
    summary["untreated_end_total"] = control["end_total"]
    summary["relative_endpoint_difference_vs_untreated"] = (
        (summary["end_total"] - control["end_total"]) / control["end_total"]
        if control["end_total"] else None
    )
    report = {
        "prototype": "HeavenzFire PDAC Research Prototype",
        "version": "0.1.0",
        "python_version": platform.python_version(),
        "configuration": {"days": days, "dt": dt, "treatment": treatment, "parameters": params.__dict__},
        "summary": summary,
        "warnings": [
            "Default coefficients are synthetic and not fitted to biological data.",
            "Outputs are not clinical predictions or treatment recommendations.",
            "Software tests do not establish biological or clinical validity."
        ]
    }
    (out / "summary.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report

def main():
    parser = argparse.ArgumentParser(description="Synthetic PDAC growth/treatment-response simulator")
    parser.add_argument("--days", type=float, default=120.0)
    parser.add_argument("--dt", type=float, default=0.1)
    parser.add_argument("--treatment", choices=("on", "none"), default="on")
    parser.add_argument("--out", default="results")
    args = parser.parse_args()
    print(json.dumps(run(args.out, args.days, args.dt, args.treatment), indent=2))

if __name__ == "__main__":
    main()
