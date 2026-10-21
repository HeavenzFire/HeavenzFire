# HeavenzFire AI Federation

**Status:** adapter contract and provider inventory proposal; no provider is considered connected until a live authenticated smoke test and evidence record pass.

## Objective

Route work across commercial APIs, local model runtimes, research services, and browser-assisted tools through one auditable interface while preserving provider-specific capabilities and failure modes.

## Provider inventory

| Provider | Intended integration | Initial status | Notes |
|---|---|---|---|
| OpenAI / GPT | Official API adapter | candidate | Requires user-supplied API credential in environment; never commit keys |
| Anthropic / Claude | Official Messages API adapter | candidate | Provider-native request and response mapping required |
| Google / Gemini | Official Gemini API adapter | candidate | Provider-native request and response mapping required |
| DeepSeek | Official API or compatible endpoint | candidate | Validate supported API features and model IDs |
| Mistral | Official API or compatible endpoint | candidate | Existing manual bridge has an outstanding PowerShell import hang |
| Llama | Local Ollama or another declared local inference runtime | local adapter candidate | Llama is a model family; hosting runtime must be identified explicitly |
| HeavenzFire | Local orchestration, tools, memory/evidence, and model policy | in-repository components | Do not imply a distinct foundation model exists unless a specific model artifact is configured |
| Perplexity | Research/search API where available | research adapter candidate | Browser UI access is not equivalent to an API integration |
| Monica | Official supported API or user-attended browser workflow | unverified | Do not automate private endpoints or bypass access controls |
| Merlin | Official supported API or user-attended browser workflow | unverified | Do not treat a browser session as a stable API |
| Other providers | Capability-declared plugin/adapter | disabled by default | Must pass contract, permission, and provenance review |

## Shared adapter contract

An adapter declares a stable ID, provider, transport, supported capabilities, model identifiers, required environment-variable names (never values), data handling, network policy, timeout, and integration state.

A normalized task includes a unique task ID, task type, user-approved data scope, bounded input, output schema, deadline, and approval state. A normalized result includes provider/adapter identity, model identifier when known, outcome (`completed`, `failed`, `timed_out`, `blocked`, `review_required`), output, timing, and evidence references.

Adapters must:
- validate both input and output;
- apply per-provider deadlines and bounded response sizes;
- redact credentials and avoid logging prompts by default;
- make external data transfer explicit;
- preserve source links for research answers;
- return explicit unsupported/unavailable states;
- never silently switch providers when privacy, cost, or task scope changes;
- never convert pending approval into approval or execute arbitrary returned code.

## Routing policy

1. Filter by declared capability, status, privacy/data scope, and explicit user policy.
2. Choose one provider for a minimal smoke test before adding fan-out.
3. For cross-review tasks, dispatch independently, retain separate outputs, and synthesize disagreements with citations/evidence.
4. Treat model confidence as a claim, not verification. Use deterministic tests and source checking where appropriate.
5. Keep local-only tasks local. External calls require configured credentials and an explicit outbound-data policy.
6. Record cost/usage only from trustworthy provider-reported fields; never invent token counts or prices.

## Integration stages

1. **Registry and contract:** catalog providers and validate manifests without making network calls.
2. **Local vertical slice:** test the normalized adapter contract against a local Ollama endpoint using a deliberately small model and bounded request.
3. **Official API adapters:** implement one provider at a time using official documentation, explicit credential names, request timeouts, and mocked contract tests.
4. **Research and browser services:** use supported APIs first; browser automation must remain user-attended and permission-scoped where no supported API exists.
5. **Multi-provider council:** add opt-in independent review, disagreement detection, source verification, and evidence ledger integration.
6. **Operator IDE:** show actual per-provider health, configuration, permission scope, and last verified evidence. Never infer connected status from configuration alone.

## Verification rule

A provider progresses through `catalogued` → `configured` → `smoke-tested` → `contract-verified`. Only the last two require observed runtime evidence, and `contract-verified` requires reproducible tests. Static registry entries are not live connections.
