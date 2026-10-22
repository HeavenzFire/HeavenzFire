# HeavenzFire API (initial foundation)

A local-first API layer owned by HeavenzFire. It presents one authenticated interface over Gemini and local Ollama models. Gemini's API remains a provider; this service, its auth contract, routing and local integration are ours.

## Routes

- `GET /health` — minimal unauthenticated health/configuration status; never returns secret values.
- `GET /v1/models` — authenticated model list.
- `POST /v1/chat/completions` — authenticated chat endpoint with an OpenAI-style response envelope.
- `POST /v1/generate` — authenticated simple text-generation endpoint.

Requests to protected routes require `Authorization: Bearer <HF_API_KEYS entry>`.

Example:

```powershell
$env:HF_API_KEYS = 'replace-with-a-long-random-token'
$env:GEMINI_API_KEY = 'set-this-only-in-your-local-shell-or-secret-store'
$env:HF_HOST = '127.0.0.1'
$env:PORT = '18796'
node .\server.cjs
```

Then, from another PowerShell window:

```powershell
$headers = @{ Authorization = 'Bearer replace-with-a-long-random-token' }
Invoke-RestMethod http://127.0.0.1:18796/health
$body = @{ model = 'gemini-2.5-flash'; messages = @(@{ role = 'user'; content = 'Reply exactly HEAVENZFIRE_API_OK' }) } | ConvertTo-Json -Depth 8
Invoke-RestMethod http://127.0.0.1:18796/v1/chat/completions -Method Post -Headers $headers -ContentType 'application/json' -Body $body
```

Use `provider = 'ollama'` or a local model ID such as `llama3.2:1b` to route to Ollama. The server defaults to loopback and refuses non-loopback binding unless `HF_ALLOW_REMOTE_BIND=true` is explicitly set. Do not set that flag on a public host without a TLS reverse proxy, authentication, network controls, and an operational secret manager.

## Development and tests

Requires Node.js 18+ (native `fetch`). No third-party runtime dependency.

```powershell
npm test
npm start
```

Tests exercise health redaction, authentication, model listing and request validation without calling a paid provider.

## Security / current limitations

- This is an initial single-process service, not yet production-deployed.
- API tokens are provided through the process environment; use a secret store or OS-protected configuration for persistent deployments.
- Rate limiting, per-client quotas, durable audit logging, OAuth, GitHub App JWT/installation-token flows, TLS hosting and cloud deployment are not implemented in this first slice.
- Do not expose the API publicly until those controls and provider error handling have been reviewed.
- Never put Gemini keys, GitHub private keys, OAuth client secrets, or API bearer tokens in frontend code or repository files.
