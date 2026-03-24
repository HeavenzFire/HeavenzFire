# IGNIS v2.1 Starter Pack

Lean, modular content testing engine for daily execution. Speed > completeness.

## Structure
```
.
├── data/
│   ├── content_log.csv
│   └── ideas.csv
├── templates/
│   ├── hooks.txt
│   ├── ctas.txt
│   └── scripts/
├── dashboards/
│   └── index.html
├── automation/
│   └── post_queue.json
└── README.md
```

## Daily Loop
1. **Input**: Add 5 ideas to ideas.csv, score top 2 (&ge;3.5).
2. **Build**: 2 videos, 3 hooks each using templates.
3. **Deploy**: TikTok first, sequence to Reels/X.
4. **Log**: Metrics to content_log.csv after 1-2h.

## Thresholds
- Kill: <65% 3s retention, <40% completion.
- Scale: &ge;75% completion, &ge;10% engagement, &ge;5% shares.

## Quick Start
1. Open `dashboards/index.html`.
2. Add ideas/metrics via CSV or dashboard.
3. Use `open dashboards/index.html` in terminal.

Sample ideas loaded. Tailored for AI/software creators (planetary mesh, etc.).

## Decision Engine
Use dashboard to sort/highlight winners.

Built by BLACKBOXAI per your plan.
