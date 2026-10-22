# Threat Model

## Assets

Credentials, source code, Git history, audit reports, and the repository owner's authority to control scope and remediation.

## Threats

1. A real credential is committed accidentally.
2. A report leaks the secret it was meant to detect.
3. A harmless example, client ID, deployment URL, or rotated key is mislabeled as a confirmed compromise.
4. A scanner silently uploads code or credentials.
5. A tool revokes credentials, rewrites history, publishes issues, or changes permissions without approval.
6. Crafted files, binary data, oversized files, or symlinks cause unsafe scanning behavior.

## Requirements

- Local-only operation in the core scanner.
- Redact matched credentials before output.
- Findings include rule, file, line, severity, confidence, and rationale.
- Never validate or use discovered credentials.
- Skip VCS internals, dependencies, build outputs, binary files, and symlinks.
- Bound file sizes and make scan scope explicit.
- Keep reports local unless the operator deliberately shares them.
- Keep destructive remediation and history rewriting human-approved.

## Trust boundaries

The working tree is untrusted input. Scanner output is advisory, not a verdict. Search results are untrusted evidence until reviewed. Provider consoles are authoritative for credential revocation and usage evidence.

## Out of scope

No live-key validation, credential use, exploitation, arbitrary internet crawling, third-party repository harvesting, or automatic changes to IAM, billing, OAuth consent, permissions, or deployment settings.

## Disclosure

Do not quote a likely secret in a public issue. Notify the owner privately. Rotate a confirmed exposed credential; deleting a visible string does not invalidate copies in forks, caches, logs, or history.