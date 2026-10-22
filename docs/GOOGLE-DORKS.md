# Google Search Patterns for Authorized Audits

These are starting points for audits of repositories you own or are authorized to inspect. They are not proof of a vulnerability. Adapt syntax to the platform's documented search grammar. Never use results to collect, test, or exploit credentials.

## OAuth clients and configuration

- "client_secret" "client_id" "googleusercontent.com"
- filename:client_secret.json "installed"
- "redirect_uri" "oauth2" "googleapis.com"
- filename:.env GOOGLE_CLIENT_SECRET
- "accounts.google.com/o/oauth2/token" "client_secret"

## Apps Script

- filename:appsscript.json "timeZone"
- filename:appsscript.json "oauthScopes"
- "script.google.com/macros/s/" "exec"

Deployment URLs and IDs can be intentionally public. Assess deployment access and behavior before classifying them as a vulnerability.

## Gemini and Google API configuration

- "GEMINI_API_KEY"
- "generativelanguage.googleapis.com"
- "AIzaSy" "gemini"
- filename:.env GEMINI_
- "provider: google" "gemini"

Do not publish matched values. A key-shaped string may be synthetic, revoked, or unrelated to the project. Never test a key by calling a provider unless the credential owner explicitly authorized that validation.

## Search syntax caveats

- filename, extension, repo, and fork qualifiers are platform-specific.
- Do not assume arbitrary regular-expression support.
- "AIzaSy" is a broad heuristic and can produce false positives.
- OAuth client IDs are usually identifiers; client secrets, refresh tokens, and private keys are sensitive.
- An Apps Script URL is not by itself proof of exposed credentials.
- Search indexes may lag deletions and may not cover every branch, fork, or historical commit.

## Evidence capture

Record repository URL, file path, commit/ref, line, rule, confidence, and a redacted snippet. Do not store the matched credential itself. Use private reporting channels for sensitive findings.