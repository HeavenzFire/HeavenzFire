# HeavenzFire 144A BrowserBridge

This is a local-first integration layer for the HeavenzFire 144A task queue and a bounded browser automation runner intended to replace selected credit-metered browser-agent workflows.

## Existing 144A task queue

From Windows PowerShell 5.1:

```powershell
& "$env:USERPROFILE\HeavenzFire\UnifiedField\BrowserBridge\Start-BrowserBridge.ps1"
```

Then open http://127.0.0.1:18795/ in Edge or Chrome.

The Chrome / Edge extension is under the extension directory. Load it as an unpacked extension from the browser's extensions page with Developer mode enabled. The extension submits bounded task records to the local queue; it does not run arbitrary commands.

API endpoints include GET /health, GET /api/registry, GET /api/tasks, POST /api/tasks, POST /api/tasks/:id/plan, POST /api/tasks/:id/run, and POST /api/tasks/:id/browser-run. Execution is bounded to local-model lanes; no shell commands are executed.

## Integrated 144A browser lane

In 144A Studio's Task fabric, select a Planned or ReviewRequired task and choose Browser run (scoped). Supply:
- One starting HTTP(S) URL without credentials, query strings, or fragments.
- An exact comma-separated origin allowlist (scheme, host, and port); wildcards are rejected.
- A bounded JSON action list (click, fill, waitForText) and assertion list (textEquals, titleEquals, pathEquals).
- A one-run confirmation.

The API accepts browser runs only for Planned or ReviewRequired tasks and requires approved: true. It records the browser result and audit events on the original 144A task. Actions are capped at 30, assertions at 30, allowed origins at 20, fill values at 2,000 characters, and per-operation timeouts at 20 seconds.

The runner uses a fresh isolated temporary Edge profile, not the user's logged-in browser profile. Only exact allowlisted origins receive page requests; other origins and popups are blocked. This makes the same runner reusable across public sites while retaining per-task site boundaries. It does not silently inject into every tab, reuse saved passwords, solve CAPTCHA/MFA, or perform arbitrary downloads/uploads. Include a site's required first-party/CDN origins explicitly when needed; do not broaden the list to wildcards.

## Local browser automation replacement

The integrated browser-task-runner.cjs module uses Microsoft Edge plus the open-source puppeteer-core library to run bounded tasks without a paid browser-agent API or credit wallet. It is a local-first automation lane, not a universal replacement for every hosted agent feature.

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

A task contains an ID, a starting URL, exact allowed origins (scheme, hostname, and port), bounded actions (click, fill, waitForText), assertions (textEquals, titleEquals, pathEquals), and a timeout capped at 20 seconds. Initial URLs containing credentials, query strings, or fragments are rejected. The runner creates an isolated temporary browser profile, intercepts page requests, blocks unlisted origins, closes popups, writes redacted JSONL outcome evidence, and removes the temporary profile after the run.

### Security and current limitations

- Keep this runner for controlled, approved tasks; do not supply passwords, session cookies, private keys, or other secrets as task values.
- The allowlist is an exact origin list including scheme and port, not a per-path authorization system. Use dedicated test accounts and least-privilege access for authenticated sites.
- Browser page requests are intercepted and background browser networking is disabled; this does not claim to control networking by other applications on the computer.
- Only a small deterministic action set is supported. CAPTCHA, MFA, arbitrary downloads, file uploads, complex SPA interactions, and third-party site compatibility are not yet accepted.
- Do not disable a paid service for a workflow until that workflow has passed its own acceptance tests and rollback is documented.
- The runner code is MIT-licensed; puppeteer-core is Apache-2.0. Recheck transitive licenses when updating dependencies.

## Network boundary

The 144A server binds only to 127.0.0.1. It is not an internet server and is not reachable from Android over the LAN. Do not bind it to 0.0.0.0 to work around this limitation. Remote access requires a separately authenticated private tunnel and per-device identity.

## Persistent Chrome automation worker

The bridge starts chrome-automation-worker.cjs as a detached local process. It launches a visible Google Chrome instance with a dedicated profile at %LOCALAPPDATA%\HeavenzFire\144A-BrowserProfiles\AutonomousWorker, keeps the 144A page open, and polls the existing %USERPROFILE%\HeavenzFire\144A\tasks store for approved browser jobs. A PID lock prevents duplicate workers. Jobs marked Running when the worker restarts are recovered to Queued; the task JSON is the durable queue and result record.

### Read-only job contract

Submit a job to POST http://127.0.0.1:18795/api/automation/jobs from the local 144A origin. The request must include approved=true for that specific job, a title, a goal, and a browserTask with an exact allowedOrigins list. Persistent worker actions are deliberately limited to navigate, waitForText, and extractText. Clicks, form fills, submissions, purchases, posts, messages, arbitrary JavaScript, and shell execution are not available in this autonomous lane.

Example request body:

    {
      "approved": true,
      "title": "Read public project documentation",
      "goal": "Extract the main page text and verify the page title.",
      "browserTask": {
        "url": "https://example.com/",
        "allowedOrigins": ["https://example.com"],
        "timeoutMs": 10000,
        "actions": [
          { "type": "extractText", "selector": "body", "maxChars": 4000 }
        ],
        "assertions": [
          { "type": "titleEquals", "expected": "Example Domain" }
        ]
      }
    }

The worker records extracted text, final URL, title, assertion results, timestamps, and task events in the task JSON; runner evidence is appended to browser-runner-evidence.jsonl. GET /api/automation/status reports worker state. GET /health includes browserWorker.

The Chrome profile is intentionally separate from the user's personal Chrome profile. It does not silently reuse saved passwords, cookies, or signed-in sessions. Exact-origin request interception limits page resources to the origins approved for that job. Jobs finish in ReviewRequired; a passing browser assertion is evidence of the specified page state, not proof that a larger research conclusion is correct.

### Start and verify

Run Start-BrowserBridge.ps1. Confirm /health reports browserWorker: running and /api/automation/status reports the worker PID and dedicated profile. Submit one approved read-only job and verify the corresponding task JSON reaches browserAutomation.status: PASS or an explicit FAIL. The worker and browser are local processes; they do not continue if Windows shuts down.


### Logon persistence

A current-user Startup-folder command file, HeavenzFire-144A-BrowserBridge.cmd, is installed at %APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup. It starts Start-BrowserBridge.ps1 at user logon; the bridge starts the persistent Chrome worker. It does not run as SYSTEM, elevate privileges, or access another user's profile. Reinstall with Install-HeavenzFireBrowserWorker-Autostart.ps1; remove the .cmd file from Startup to disable. The machine and user session must be running; this is not cloud execution.


The bridge serves %USERPROFILE%\HeavenzFire\HeavenzFire-144A-Tasker.html when present; otherwise it serves the repository-local HeavenzFire-144A-Tasker.html. The included tasker uses the persistent Chrome job endpoint and displays live worker status.