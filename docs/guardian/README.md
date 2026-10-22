# HeavenzFire Repository Guardian v0.1

## Purpose
A read-only, PowerShell 5.1-compatible first-pass monitor for repositories accessible to the authenticated GitHub CLI account. It records a local baseline and reports changes to each repository's latest commit and basic metadata. It never reverts, deletes, blocks, or modifies GitHub resources.

## Requirements
- Windows PowerShell 5.1 or newer
- GitHub CLI (gh) installed and authenticated as the account you intend to audit
- Read access to the repositories being checked

Run gh auth status first. Use a narrowly scoped account/token with read-only access where possible.

## Run
```powershell
gh auth status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\Invoke-GuardianAudit.ps1
```

The first run establishes a baseline; it does not claim to detect past changes. Later runs compare current observations with that baseline and report changed repository heads/metadata. Review every reported change: a change is evidence of difference, not proof of compromise.

Baseline and reports are stored under $env:LOCALAPPDATA\HeavenzFire\Guardian by default. Keep that directory backed up and protected. Pass -BaselinePath to choose another location. Pass -ResetBaseline only when you intentionally want to accept the current state as the new baseline.

## Scope and limits
- This is polling, not continuous real-time surveillance. Schedule it with Windows Task Scheduler after a successful manual test.
- It sees only repositories and commit data the authenticated GitHub account can read.
- The baseline is local and can itself be tampered with by someone controlling the Windows account. For stronger evidence, copy reports to separate protected storage or sign them.
- The script does not inspect every file diff, collaborator event, branch protection setting, secret, GitHub App installation, or billing/security setting.
- A missing API response is recorded as an error and is never interpreted as proof that a repository is safe.
- Do not put tokens or secrets in the baseline or report. The script relies on GitHub CLI's existing authentication.

## Next hardening steps
1. Test with a small repository and confirm a known commit is reported.
2. Protect the baseline and export reports to a separate append-only location.
3. Add branch-protection, workflow-file, collaborator, and audit-log checks where the account/API permissions allow.
4. Add scheduled execution only after credentials and alert delivery have been explicitly configured.