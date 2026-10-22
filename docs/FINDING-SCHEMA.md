# Finding Schema (v0.1)

Each JSON finding contains:

- rule_id: stable identifier, such as SEA-GOOGLE-API-KEY.
- severity: critical, high, medium, or info.
- confidence: high, medium, or low. This is confidence in the pattern match, not proof of exploitation.
- path: path relative to the selected scan root.
- line: one-based line number.
- message: concise reason for the finding.
- evidence: redacted context. Never include the complete matched secret.
- remediation: next safe action.

A finding is not a confirmed incident until the repository owner validates its context. Reports should be treated as security-sensitive artifacts.