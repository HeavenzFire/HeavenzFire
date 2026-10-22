# Regenerative Syntropic Fabric v3.0

A self-contained, local-first roadmap topology component for the HeavenzFire unified system.

## Run

Open `index.html` in a modern browser. No package installation, build step, CDN, or server is required.

## Included

- Five architectural layers with filter controls.
- 49 initiative placeholder nodes, layer membership edges, and an 11-link critical-path candidate chain.
- Search, node inspector, bounded local force refinement, SVG export, and JSON diagnostics export.
- Runtime integrity checks for initiative count, ID uniqueness, layer coverage, edge endpoints, and critical-path links.
- No global event-prototype patches, service-worker modifications, network telemetry, or global animation-frame cancellation.

## Data provenance

**The initiative labels are reconstructed placeholders, not recovered original roadmap records.** The supplied overview named categories but did not provide the original 49/50 initiative dataset. Counts and integrity checks verify this reconstructed dataset only; they do not establish equivalence to an original source.

## Verification performed

- Node.js JavaScript syntax check passed.
- Headless Chromium smoke test passed: 49 initiatives, 60 edges, 5 layers, 54 total graph nodes (49 initiatives + 5 layer anchors), all 5 integrity checks passed, force-refinement control and search exercised, no page errors observed.

## Design note

The component uses a native SVG renderer with a deterministic layered layout and optional bounded local force refinement. This intentionally avoids runtime CDN dependency failures; it is not a Graphology/Sigma build.
