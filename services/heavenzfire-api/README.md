# HeavenzFire API (initial foundation)

A local-first API layer owned by HeavenzFire. It presents one authenticated interface over Gemini, local Ollama, OpenAI, Anthropic Claude, Mistral, Qwen, Groq, OpenRouter, and an optional custom OpenAI-compatible endpoint. Gemini's API remains a provider; this service, its auth contract, routing and local integration are ours.

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

Choose `provider` explicitly in the request: `gemini`, `ollama`, `openai`, `anthropic`, `mistral`, `qwen`, `groq`, `openrouter`, or `custom`. For example, set `provider = 'ollama'` to route locally. Mistral, Groq, and OpenRouter use OpenAI-compatible chat-completions requests; Qwen uses the same protocol but requires the correct region/workspace-specific `QWEN_BASE_URL`. Claude uses Anthropic's native Messages API. Provider credentials are independent and must be configured in the server environment. The server defaults to loopback and refuses non-loopback binding unless `HF_ALLOW_REMOTE_BIND=true` is explicitly set. Do not set that flag on a public host without a TLS reverse proxy, authentication, network controls, and an operational secret manager.

## Launch a local GPT-6-family session on Windows

From this directory in Windows PowerShell 5.1 or newer:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Start-HeavenzFire-GPT.ps1
```

The launcher asks for an OpenAI API key using hidden input on first use, validates it against the OpenAI model-list endpoint, and proceeds only if that key can see at least one `gpt-6` / `gpt-6.*` / `gpt-6-*` model ID. It lets you select an exposed model. The key and local bearer token are stored using Windows DPAPI for the current Windows user, never committed to this repository, and are passed to the Node server through its process environment—not command-line arguments. The gateway binds to `127.0.0.1:18796`, and the launcher stops the gateway when you type `/exit`.

The OpenAI adapter uses the Responses API and wraps the text response in the local chat-completions envelope. A successful model-list check proves key authentication and model listing, **not** that every listed model is enabled for inference; the first prompt is the actual inference test. If no GPT-6-family model is listed, the script stops rather than silently substituting Ollama or another model.

**Billing:** ChatGPT subscriptions and OpenAI API usage are billed separately. The launcher does not send an inference request until you enter a prompt. Check API project billing, limits, and model access before using it. This connects a local client to a hosted API model; it does not download GPT weights or provide desktop-control tools by itself.

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
- Muse and Monica are not enabled as named adapters: their service-specific API endpoints, authentication methods and permitted integration methods must be verified first. If they provide a compatible endpoint, the optional `custom` adapter may be usable after testing.
- Do not expose the API publicly until those controls and provider error handling have been reviewed.
- Never put Gemini keys, GitHub private keys, OAuth client secrets, or API bearer tokens in frontend code or repository files.
