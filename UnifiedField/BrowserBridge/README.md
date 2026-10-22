# HeavenzFire 144A BrowserBridge

This is a local-first integration layer for the HeavenzFire 144A task queue and a bounded browser automation runner intended to replace selected credit-metered browser-agent workflows.

## Existing 144A task queue

From Windows PowerShell 5.1:

```powershell
& "$env:USERPROFILE\HeavenzFire\UnifiedField\BrowserBridge\Start-BrowserBridge.ps1"
```

Then open http://127.0.0.1:18795/ in Edge or Chrome.

The Chrome / Edge extension is under the extension directory. Load it as an unpacked extension from the browser's extensions page with Developer mode enabled. The extension submits bounded task records to the local queue; it does not run arbitrary commands.

API endpoints include GET /health, GET /api/registry, GET /api/tasks, POST /api/tasks, POST /api/tasks/:id/plan, and POST /api/tasks/:id/run. Execution is bounded to local-model lanes; no shell commands are executed.

## Local browser automation replacement

The separate browser-task-runner.cjs uses Microsoft Edge plus the open-source puppeteer-core library to run bounded tasks without a paid browser-agent API or credit wallet. This is a local-first automation adapter, not a universal replacement for every hosted agent feature.

### Install and test

From this directory, with Node.js 20.18+ and Microsoft Edge installed:

```powershell
npm ci
npm test
```

The integration test starts a temporary local fixture, clicks a button, checks page title/path/text, and confirms that a request to an unlisted host is blocked.

### Run a task

```powershell
node .\browser-task-runner.cjs .\my-task.json
```

A task contains an ID, a starting URL, exact allowed origins (scheme, hostname, and port), bounded actions (click, fill, waitForText), assertions (textEquals, titleEquals, pathEquals), and a per-operation timeout capped at 20 seconds. Initial URLs containing credentials, query strings, or fragments are rejected. The runner creates an isolated temporary browser profile, intercepts page requests, blocks unlisted origins, blocks script-created popups and closes unexpected page targets, writes JSONL outcome evidence with errors truncated to 300 characters, and removes the temporary profile after the run.

### Security and current limitations

- Keep this runner for controlled, approved tasks; do not supply passwords, session cookies, private keys, or other secrets as task values.
- The allowlist is an exact origin list including scheme and port, not a per-path authorization system. Hostnames must use valid DNS labels or IP literals. Use dedicated test accounts and least-privilege access for authenticated sites.
- Browser page requests are intercepted and background browser networking is disabled; this does not claim to control networking by other applications on the computer.
- Only a small deterministic action set is supported. CAPTCHA, MFA, arbitrary downloads, file uploads, complex SPA interactions, and third-party site compatibility are not yet accepted.
- Do not disable a paid service for a workflow until that workflow has passed its own acceptance tests and rollback is documented.
- The runner code is MIT-licensed; puppeteer-core is Apache-2.0. Recheck transitive licenses when updating dependencies.

## Network boundary

The 144A server binds only to 127.0.0.1. It is not an internet server and is not reachable from Android over the LAN. Do not bind it to 0.0.0.0 to work around this limitation. Remote access requires a separately authenticated private tunnel and per-device identity.