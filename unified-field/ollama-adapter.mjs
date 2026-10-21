import { URL } from "node:url";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DEFAULT_ENDPOINT = "http://127.0.0.1:11434";
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_PROMPT_CHARS = 24_000;
const MAX_OUTPUT_TOKENS = 512;

export function validateOllamaEndpoint(endpoint = DEFAULT_ENDPOINT) {
  let parsed;
  try { parsed = new URL(endpoint); }
  catch { throw new Error("Ollama endpoint must be a valid URL"); }
  if (parsed.protocol !== "http:" || !LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("Ollama adapter permits HTTP loopback endpoints only");
  }
  if (parsed.username || parsed.password) throw new Error("credentials must not be embedded in the endpoint URL");
  return parsed;
}

export function normalizeOllamaResult(payload, model) {
  if (!payload || typeof payload !== "object" || !payload.message || typeof payload.message.content !== "string") {
    throw new Error("Ollama returned an unexpected response shape");
  }
  return {
    provider: "ollama",
    model: typeof payload.model === "string" ? payload.model : model,
    outcome: "completed",
    text: payload.message.content,
    done: payload.done === true,
    executionStarted: false,
    evidence: {
      source: "local-ollama-api",
      totalDurationNs: Number.isFinite(payload.total_duration) ? payload.total_duration : null,
      promptTokens: Number.isSafeInteger(payload.prompt_eval_count) ? payload.prompt_eval_count : null,
      outputTokens: Number.isSafeInteger(payload.eval_count) ? payload.eval_count : null
    }
  };
}

export async function invokeLocalOllama({
  prompt,
  model = process.env.HEAVENZFIRE_LOCAL_MODEL || "llama3.2:1b",
  endpoint = process.env.HEAVENZFIRE_OLLAMA_ENDPOINT || DEFAULT_ENDPOINT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputTokens = 256,
  fetchImpl = globalThis.fetch
} = {}) {
  validateOllamaEndpoint(endpoint);
  if (typeof prompt !== "string" || prompt.trim().length === 0) throw new Error("prompt must be a non-empty string");
  if (prompt.length > MAX_PROMPT_CHARS) throw new Error(`prompt exceeds ${MAX_PROMPT_CHARS} characters`);
  if (typeof model !== "string" || !/^[a-zA-Z0-9._:-]{1,128}$/.test(model)) throw new Error("model must be a valid local model identifier");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) throw new Error("timeoutMs must be between 100 and 120000");
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > MAX_OUTPUT_TOKENS) throw new Error(`maxOutputTokens must be between 1 and ${MAX_OUTPUT_TOKENS}`);
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable in this Node.js runtime");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL("/api/chat", endpoint), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: { num_predict: maxOutputTokens }
      }),
      signal: controller.signal,
      redirect: "error"
    });
    if (!response || typeof response.ok !== "boolean") throw new Error("fetch returned an invalid response object");
    if (!response.ok) throw new Error(`Ollama request failed with HTTP ${response.status}`);
    const payload = await response.json();
    return normalizeOllamaResult(payload, model);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Ollama request timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
