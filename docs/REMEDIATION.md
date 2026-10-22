# Credential Exposure Remediation

1. Do not paste a suspected secret into chat, tickets, logs, or public issues.
2. Determine the type: API key, OAuth client secret, refresh token, service-account private key, or non-secret identifier.
3. If confirmed exposed, rotate or revoke through the provider's official console and follow the owner's incident-response policy.
4. Review available audit logs and usage history for unexpected activity.
5. Remove secrets from source and use a suitable secret manager or protected environment configuration.
6. Check branches, tags, release artifacts, CI logs, caches, and Git history. History cleanup is disruptive and does not invalidate the credential.
7. Add synthetic regression fixtures and enable pre-commit/CI scanning.
8. Record remediation and verification without recording the secret itself.

## Google-specific distinctions

- OAuth client IDs are usually identifiers, not confidential credentials.
- OAuth client secrets, refresh tokens, and service-account private keys are sensitive.
- API keys have different restrictions and risk profiles; inspect API restrictions and usage.
- Apps Script deployment IDs and URLs may be intentionally shareable. Assess permissions rather than treating every URL as a secret.
- An environment-variable name such as GEMINI_API_KEY is not itself a credential.

## Require explicit approval

Never automatically revoke or rotate credentials, change IAM roles, alter OAuth consent or billing, rewrite Git history, delete repositories, publish reports, or open public issues.