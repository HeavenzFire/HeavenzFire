# Google AI Studio Coding-Agent Setup — Shared Knowledge Base

**Source page:** https://aistudio.google.com/docs/coding-agents  
**Documentation index:** https://aistudio.google.com/docs/llms.txt  
**Full documentation corpus:** https://aistudio.google.com/docs/llms-full.txt  
**Official Gemini skills repository:** https://github.com/google-gemini/gemini-skills  
**Gemini Docs MCP endpoint:** https://gemini-api-docs-mcp.dev  
**Recorded:** 2026-10-22  
**Purpose:** Shared reference for HeavenzFire Unified Field, Gemini Bridge, and all coding agents.

> This file summarizes Google's official documentation; it is not a mirror of the full documentation. Recheck official sources for current API schemas, supported models, feature availability, limits, and pricing before implementation.

## Why this matters

Coding agents can suggest deprecated models, legacy SDKs, and outdated API patterns. HeavenzFire agents should consult Google's live developer resources before writing or modifying Gemini API code.

## Required project rules

1. Consult the Gemini Docs MCP tools (gemini_search_docs / gemini_get_doc) or the official machine-readable index at https://aistudio.google.com/docs/llms.txt before implementing Gemini API features.
2. Prefer the current Google Gen AI SDKs: google-genai for Python and @google/genai for TypeScript/JavaScript. Do not introduce the legacy google-generativeai or @google/generative-ai SDKs in new work.
3. Prefer the Interactions API (client.interactions.create) for new applications unless a documented feature requirement calls for another API, such as generateContent.
4. Select currently supported models using https://aistudio.google.com/docs/models. Do not assume a model is current merely because it appears in training data or an older repository.
5. Verify SDK/API compatibility, request schema, authentication, limits, errors, and billing implications against current official documentation.
6. Never commit API keys, OAuth client secrets, private keys, bearer tokens, or other credentials. Use local environment variables or an approved secret store; redact credentials from logs and test output.
7. Do not report a provider connection as working until a real, bounded test has succeeded and the result is recorded.

## Official Gemini Agent Skills

Repository: https://github.com/google-gemini/gemini-skills

The official documentation describes these skills:

- **gemini-api-dev:** Interactions API and SDK patterns; text generation, multi-turn chat, streaming, structured outputs, function calling, image generation, TTS, multimodal inputs, server-side state, background execution, Deep Research, managed agents, and migration away from legacy patterns.
- **gemini-live-api-dev:** real-time audio/video; WebSocket sessions, ephemeral client tokens, session resumption, VAD, interruption/barge-in, background reasoning, asynchronous tool calls, transcription, and live speech translation.
- **gemini-omni-flash-api:** video generation/editing workflows through the Interactions API, including reference frames and media preprocessing helpers.

The documentation lists these installation commands. Run them from a controlled terminal after reviewing the package/repository and intended scope:

```powershell
# List available skills (requires Node.js/npm)
npx skills add google-gemini/gemini-skills --list

# Install individual skills globally
npx skills add google-gemini/gemini-skills --skill gemini-api-dev --global
npx skills add google-gemini/gemini-skills --skill gemini-live-api-dev --global
npx skills add google-gemini/gemini-skills --skill gemini-omni-flash-api --global

# Project-local installation, useful if global rules conflict
npx skills add google-gemini/gemini-skills --skill gemini-api-dev
```

The docs also describe Context7 installation:

```powershell
npx ctx7 skills install /google-gemini/gemini-skills gemini-api-dev
```

Do not claim these skills are installed until checking the actual local environment and running the relevant verification command.

## Gemini Docs MCP Server

Endpoint: https://gemini-api-docs-mcp.dev

The server provides live documentation tools:
- **gemini_search_docs:** search official Gemini documentation by query.
- **gemini_get_doc:** retrieve a documentation page as Markdown.

The official page gives this general setup command for detected coding agents:

```powershell
npx add-mcp "https://gemini-api-docs-mcp.dev"
```

For Claude Code, the page documents:

```powershell
claude mcp add --transport http geminiDocs https://gemini-api-docs-mcp.dev
```

For HeavenzFire integration, first identify the target client (Cursor, Codex, VS Code, Claude Code, or another MCP-capable agent), inspect existing MCP configuration, back up files before modifying them, add only the needed server entry, and verify it using the client's status tools. Avoid overwriting unrelated MCP configuration.

## Machine-readable documentation

- Index of documentation pages: https://aistudio.google.com/docs/llms.txt
- Combined documentation corpus: https://aistudio.google.com/docs/llms-full.txt
- Clean Markdown can be requested from a documentation URL using the HTTP header Accept: text/markdown.
- The page documents direct Markdown links by appending .md to a documentation URL where supported, for example https://aistudio.google.com/docs/coding-agents.md.

Example PowerShell retrieval for inspection (not a credential-bearing request):

```powershell
$uri = 'https://aistudio.google.com/docs/coding-agents'
Invoke-WebRequest -Uri $uri -Headers @{ Accept = 'text/markdown' } -UseBasicParsing
```

Check the response content type and status before treating a response as Markdown. Network access and proxy policy may affect this command.

## Recommended AGENTS.md baseline

Add these rules to the root AGENTS.md (or equivalent agent rules file) of active Gemini-enabled repositories after inspecting existing instructions and avoiding duplicate/conflicting sections:

```markdown
# Gemini API Guidelines

- Before writing Gemini API code, consult the Gemini Docs MCP server (gemini_search_docs / gemini_get_doc) or https://aistudio.google.com/docs/llms.txt.
- Use the current Google Gen AI SDK: google-genai for Python and @google/genai for TypeScript/JavaScript. Do not introduce legacy google-generativeai or @google/generative-ai SDKs.
- Prefer the Interactions API (client.interactions.create) for new applications unless a documented feature requires another API.
- Select current supported models from https://aistudio.google.com/docs/models; avoid deprecated models.
- Verify request schemas, authentication, model availability, limits, errors, and pricing against official documentation.
- Never commit credentials. Keep keys in environment variables or an approved secret store, and redact secrets from logs.
- Test the real integration and report evidence; never claim a connection works without a successful test.
```

## Verification checklist for HeavenzFire

- [ ] Official documentation index reachable and relevant page reviewed.
- [ ] Target agent/client and configuration location identified.
- [ ] Existing MCP and skills configuration inspected and preserved.
- [ ] Official Gemini Docs MCP configured if supported by the target client.
- [ ] Needed official skills installed at appropriate project/global scope.
- [ ] Client restarted if required; MCP tools/skills visible in client status.
- [ ] Test query retrieves the current Interactions API schema from official docs.
- [ ] A minimal API call succeeds using a locally configured credential, with secrets redacted.
- [ ] SDK/model/API selection and limitations recorded.
- [ ] No credentials or generated local secrets committed.

## Links

- Coding-agent setup: https://aistudio.google.com/docs/coding-agents
- Getting started: https://aistudio.google.com/docs/get-started
- Models: https://aistudio.google.com/docs/models
- Gemini API skills repository: https://github.com/google-gemini/gemini-skills
- Gemini Docs MCP: https://gemini-api-docs-mcp.dev
- Documentation index: https://aistudio.google.com/docs/llms.txt
- Full documentation corpus: https://aistudio.google.com/docs/llms-full.txt

## Licensing and provenance

The source page states that, unless otherwise noted, Google documentation content is licensed under Creative Commons Attribution 4.0 and code samples under Apache 2.0. This file is a concise summary and implementation checklist; consult the linked source for full notices and current terms.
