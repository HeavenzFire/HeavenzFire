# HeavenzFire Attention Guard v1

A minimal Manifest V3 browser extension for user-controlled focus sessions. During a session, it blocks top-level navigation to domains that the user explicitly adds. It makes no network calls and collects no browsing history or analytics.

## Install for local testing

1. Open `chrome://extensions` in Chrome or a compatible Chromium browser.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `AttentionGuard` directory.
4. Add only the domains you want to block.
5. Choose a focus duration and select **Start focus**. Select **Stop now** to end early.

## Design guarantees

- **Opt-in:** no domains are blocked until the user starts a focus session.
- **User-selected scope:** only exact domains in the local blocklist are added to dynamic rules; no wildcard input.
- **Automatic expiry:** sessions expire after 1–180 minutes.
- **Easy exit:** the user can stop the session at any time.
- **Local-only:** preferences are stored in `chrome.storage.local`; there is no telemetry, account, analytics, or remote service.
- **Minimal permissions:** storage, alarms, and declarative network rules; no browsing-history permission or content scripts.
- **Transparent behavior:** the popup shows the active state and scheduled end time.

## Verify the pure policy helpers

From the repository root:

```powershell
node --test UnifiedField/AttentionGuard/attention-policy.test.mjs
node --check UnifiedField/AttentionGuard/service-worker.js
node --check UnifiedField/AttentionGuard/popup.js
```

The automated tests verify input normalization and deterministic rule generation. They do not replace the pending manual browser installation and navigation smoke test.

## Limits

This is a user-controlled focus aid, not a system-wide blocker, a parental-control system, or a guarantee against deliberate bypass. It blocks main-frame navigation, not every embedded request. A user can remove the extension or disable it. This limitation is intentional: the tool supports self-directed attention rather than coercive lock-in.
