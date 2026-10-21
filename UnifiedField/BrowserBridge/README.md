# HeavenzFire 144A Tasker and BrowserBridge

The 144A Tasker is the desktop-style Edge app launched at `http://127.0.0.1:18795/`. The canonical source file is `HeavenzFire-144A-Tasker.html` at the repository root. The local BrowserBridge serves that file and owns the shared Windows task queue.

## Scoped source writer

The Coder Workbench now has an explicit source writer wired into the existing BrowserBridge:

- `GET /api/scoped-write/target?file=...` reads an existing file inside `%USERPROFILE%\HeavenzFire` and returns its SHA-256.
- `POST /api/tasks/:taskId/scoped-write` requires the local Tasker origin, a Planned or ReviewRequired task, `approved: true`, the exact current SHA-256, and replacement text no larger than 60 KiB.
- Only existing regular files inside the HeavenzFire repository are eligible. Absolute paths, traversal, symlink escapes, and unsupported extensions are rejected.
- A backup is written before replacement. JavaScript syntax and JSON parsing are checked; an optional existing `.test.cjs` or `.test.js` can run through Node's test runner. A failed check triggers restoration of the original bytes.
- Successful changes remain `ReviewRequired`; the Tasker does not mark a code change complete merely because a file was written.
- No generated shell commands are accepted or executed by this writer.

## Start and verify (Windows PowerShell 5.1)

From `C:\Users\rucke\HeavenzFire`, start the existing bridge with:

```powershell
node .\UnifiedField\BrowserBridge\bridge-server.cjs
```

Open the existing desktop shortcut, which should target `http://127.0.0.1:18795/` in Edge app mode. The bridge is loopback-only.

## Verification recorded for this change

- BrowserBridge JavaScript syntax check passed.
- Tasker inline JavaScript syntax check passed.
- Six local FieldCore suites passed: 20 tests total.
- Live scoped-writer smoke test on an unchanged existing Markdown file succeeded; before/after hashes matched and a backup was present.
- Negative checks confirmed traversal rejection, stale-hash rejection, and missing-approval rejection.
- A deliberately failing regression test was used to exercise rollback after a valid JavaScript replacement was written; the route returned 422 and the original SHA-256 was restored exactly. This caught and fixed a Windows temp-file-extension issue in the syntax-check step.

## Explicit limitation

A file-launched copy of the Tasker redirects to the local app origin so browser requests pass the same-origin/CORS boundary. This adds a real, reversible file-writing path. It does **not** yet make the local model autonomously generate and apply a code patch from a natural-language objective. Patch content must be reviewed in the Tasker editor and explicitly approved before it is written. Model output and a task's queue status are not evidence that code was implemented.
