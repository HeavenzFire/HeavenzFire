# Android command envelope contract v0.1

## Purpose

Define the small, fail-closed request format between the Android-first HeavenzFire command app and a future authenticated Unified Field gateway. This contract is groundwork, not a live transport and not a device executor.

## Request shape

A request contains exactly these fields:

- `schema_version`: `1.0`
- `request_id`: UUID for deduplication/audit correlation
- `created_at`, `expires_at`: ISO-8601 timestamps with an explicit timezone
- `target`: one of `auto`, `asus_windows`, `android`, `local_ai`, `remote_provider`
- `action`: one of the fixed action allowlist in `tools/mobile_command_contract.py`
- `params`: action-specific object; no arbitrary command, script, URL, or path fields

The request TTL must be positive and no longer than five minutes. Payloads are limited to 16 KiB. Unknown fields are rejected. The request ID supports correlation; a durable ledger must enforce idempotency separately.

## Security boundary

1. Schema validation is not authentication. The gateway must authenticate the phone and companion using a secure pairing flow and authenticated transport.
2. The client cannot self-approve an action. The server/companion derives approval requirements from its own action allowlist and requires a separate, expiring approval record bound to the exact action, parameters, request ID, and device.
3. Validating an envelope does not mean it was dispatched. Current module output always marks the request `not_dispatched`.
4. The Windows companion must map opaque `repo_id` values to locally configured repositories; never accept a filesystem path from the phone.
5. Device status is online only after an authenticated, recent heartbeat and successful health probe. No cached UI state or schema-valid request can establish online status.
6. The transport must use authenticated HTTPS or an owner-controlled private authenticated channel. No endpoint is assumed or hard-coded here.
7. This module does not execute jobs, authenticate identities, persist tasks, or establish a device connection.

## Verification

Run:

```powershell
python -m unittest tests.test_mobile_command_contract -v
```

The tests cover allowlisted envelopes, approval derivation, rejection of client-supplied approval, arbitrary-action rejection, target/parameter validation, expiry, timestamp validity, unknown fields, and payload bounds.
