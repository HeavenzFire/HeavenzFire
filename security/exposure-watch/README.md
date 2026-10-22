# HeavenzFire Exposure Watch

A local-first, human-reviewed workflow for using Google search operators ("Google Dorks") to discover *candidate* public exposures, then validate them responsibly. This is a discovery aid, not a vulnerability verdict and not a guaranteed uptime mechanism.

## Scope and safety

- Use only for assets you own, administer, or are explicitly authorized to assess.
- The launcher opens Google search pages; it does not scrape results, download target files, test credentials, authenticate to third parties, or exploit findings.
- Do not collect, copy, test, or publish secret values. Record only a URL, observation date, redacted evidence, confidence, and remediation status in a separate authorized case record.
- A Google OAuth client ID, redirect URI, Apps Script deployment URL, or API identifier is not automatically a secret.
- Public search results may be stale, incomplete, benign, or intentionally published. Verify context before assigning severity.
- Never put findings, tokens, private keys, or personal data into this repository or a public issue.

## Quick start (Windows PowerShell 5.1)

From the repository root:

```powershell
# List the catalog without opening a browser
.\security\exposure-watch\Invoke-ExposureWatch.ps1 -List

# Print the queries for one category
.\security\exposure-watch\Invoke-ExposureWatch.ps1 -Category Config

# Open one category for manual review (opens one browser tab per query)
.\security\exposure-watch\Invoke-ExposureWatch.ps1 -Category Config -OpenBrowser

# Open the full catalog only when you intend to review every query
.\security\exposure-watch\Invoke-ExposureWatch.ps1 -OpenBrowser
```

The script writes a minimal local activity log to `%LOCALAPPDATA%\HeavenzFire\ExposureWatch\query-log.csv`. It records query IDs, timestamps, and whether a search page was opened; it does **not** record result contents, secrets, or claims that an exposure was found. The log is local and is not uploaded.

## Categories

- **Config** — public configuration files that may contain sensitive fields.
- **Source** — source-code references to key and secret variable names.
- **OAuthAppsScript** — OAuth configuration and Apps Script manifest/deployment references.

The catalog intentionally avoids searching for and harvesting live credential values. Queries are starting points; tailor them to an authorized domain or repository when possible.

## Recommended review procedure

1. Define the authorized asset and time window.
2. Run a small, relevant category rather than the whole catalog.
3. Open each result manually and confirm the asset owner and context.
4. Do not test any discovered key or credential. If a real secret appears exposed, avoid copying it; record only a redacted indicator and notify the owner through a private, trusted channel.
5. Recommend rotation/revocation by the owner, removal from source, history cleanup where appropriate, and prevention controls.
6. Recheck after the owner reports remediation. Search-engine cache removal is a separate process and may lag.

## Resilience and failover

Google Search is one optional discovery source, not a dependency for the security workflow. Keep local scans and repository checks useful when search is unavailable. Any future alternate search provider must be explicitly configured, must honor its terms and access limits, and must not receive secrets or private findings. Do not describe this as an always-on connection until independent health checks and recovery tests prove that behavior.

## Current limitations

- Manual result review only; no result scraping or autonomous target enumeration.
- No continuous scheduler, alerting, backup service, or automatic failover is implemented by this script.
- Query execution is not the same as confirmed detection.
- The activity log is not an incident register or immutable audit ledger.
- This file set has not yet been tested on the user's local machine; run the commands above and record the actual result before claiming operational status.
