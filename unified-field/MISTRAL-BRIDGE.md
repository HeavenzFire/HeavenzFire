# HeavenzFire Mistral Bridge

This bridge adds a no-paid-browser-automation workflow to the existing UnifiedField integration.

## Route A: free manual Le Chat handoff

1. Export a bounded review prompt.
2. Open https://chat.mistral.ai and paste the prompt.
3. Save Mistral's answer as a UTF-8 text file.
4. Import the answer as unverified review evidence.

No Mistral API key or browser-automation credits are needed for this route. It depends on whatever free access is currently available in the user's Le Chat account.

From a checkout of this repository, in PowerShell 5.1:

    $bridge = Join-Path $PWD 'unified-field\Invoke-HeavenzFireMistralBridge.ps1'
    & $bridge -Mode Export -Task 'Review the current UnifiedField R&D runner for reliability, missing tests, and security risks.'

Open the generated Markdown prompt, paste it into Le Chat, and save the response locally. Import the response:

    & $bridge -Mode Import -Task 'Review the current UnifiedField R&D runner for reliability, missing tests, and security risks.' -ResponsePath "$env:USERPROFILE\Downloads\mistral-review.txt"

Imported results are saved under unified-field\artifacts\mistral\. They are labeled unverified and are not executed or automatically adopted.

## Route B: optional direct API

The script also supports API mode when MISTRAL_API_KEY has already been configured securely in the process or user environment:

    & $bridge -Mode Call -Model mistral-small-latest -Task 'Review the current UnifiedField R&D runner for reliability, missing tests, and security risks.'

A Le Chat login is not itself an API key. API access, model availability, and charges depend on the Mistral account and current plan; do not assume API calls are free. Never put secrets in the repository, prompt files, reports, or chat transcripts.

## Evidence and safety contract

- Mistral output is untrusted model output, not an execution instruction.
- The script never runs generated code, applies patches, creates scheduled tasks, or changes network exposure.
- No browser automation is required for the manual route.
- Model names and account entitlements can change; verify current access before relying on API mode.
- Review findings against source files and run the repository's actual test suite before accepting changes.
- The task packet does not grant access to private conversations, repositories, or local files unless their content is explicitly included by the user.
