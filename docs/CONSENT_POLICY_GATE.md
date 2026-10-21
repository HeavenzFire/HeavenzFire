# Consent Policy Gate v1

## Purpose

The policy gate is a small, local, fail-closed authorization primitive for future Unified Field export and network adapters. It makes no network calls and performs no export itself. It evaluates whether a request exactly matches an active, explicit grant.

## Run

```powershell
python -m unittest tests.test_policy_gate -v
python tools/policy_gate.py examples/consent-policy.json examples/consent-request.json
```

The example uses a synthetic local file destination and synthetic user-created notes. It does not read or export any personal data.

## Decision rules

- Invalid policy or request: deny.
- No exact match on subject, action, destination, and purpose: deny.
- Revoked consent: deny.
- Requested data classes must be a subset of those granted.
- Only an active matching grant can allow.
- Duplicate grant identifiers or duplicate data-class entries invalidate input.
- Wildcards and implicit grants are not supported.

## Security boundary

This module is a decision helper, not a security sandbox. A caller must enforce the result before performing an operation; it must not treat registry metadata as authorization. Consent revocation must be checked at the time of action. This v1 implementation does not provide identity authentication, secure persistence, cryptographic proof of consent, or tamper-resistant storage. Those require separate controls and review.
