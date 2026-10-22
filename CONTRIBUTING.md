# Contributing

- Use synthetic credentials only; never commit real secrets to test fixtures.
- Every detection rule needs positive and negative tests, a stable ID, rationale, severity, confidence, and remediation.
- Preserve local-only behavior in the core scanner. Network features must be optional, documented, and explicitly invoked.
- Redact secret values from CLI output, exceptions, and test failures.
- Do not add credential validation, credential use, stealth, exploitation, or bulk third-party harvesting.
- Document false positives and limitations.