import test from "node:test";
import assert from "node:assert/strict";
import { invokeLocalOllama, normalizeOllamaResult, validateOllamaEndpoint } from "./ollama-adapter.mjs";

test("accepts the default loopback endpoint", () => {
  assert.equal(validateOllamaEndpoint("http://127.0.0.1:11434").hostname, "127.0.0.1");
});

test("rejects non-loopback and HTTPS endpoints", () => {
  assert.throws(() => validateOllamaEndpoint("http://example.com:11434"), /HTTP loopback endpoints only/);
  assert.throws(() => validateOllamaEndpoint("https://127.0.0.1:11434"), /HTTP loopback endpoints only/);
});

test("rejects credentials embedded in endpoint URL", () => {
  assert.throws(() => validateOllamaEndpoint("http://user:pass@127.0.0.1:11434"), /credentials must not/);
});

test("normalizes a valid local model response with evidence metadata", () => {
  const result = normalizeOllamaResult({
    model: "llama3.2:1b",
    message: { role: "assistant", content: "Ready." },
    done: true,
    total_duration: 1000,
    prompt_eval_count: 3,
    eval_count: 2
  }, "fallback");
  assert.equal(result.provider, "ollama");
  assert.equal(result.text, "Ready.");
  assert.equal(result.model, "llama3.2:1b");
  assert.equal(result.evidence.outputTokens, 2);
  assert.equal(result.executionStarted, false);
});

test("rejects invalid response shape", () => {
  assert.throws(() => normalizeOllamaResult({ message: { content: 42 } }, "model"), /unexpected response shape/);
});

test("rejects blank prompts and invalid model IDs before network calls", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("should not be called"); };
  await assert.rejects(() => invokeLocalOllama({ prompt: " ", fetchImpl }), /non-empty string/);
  await assert.rejects(() => invokeLocalOllama({ prompt: "hello", model: "../bad", fetchImpl }), /valid local model identifier/);
  assert.equal(calls, 0);
});

test("sends a bounded non-streaming chat request to loopback and normalizes result", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url: String(url), options };
    return {
      ok: true,
      status: 200,
      json: async () => ({ model: "llama3.2:1b", message: { content: "Local answer" }, done: true })
    };
  };
  const result = await invokeLocalOllama({ prompt: "test prompt", fetchImpl });
  assert.equal(request.url, "http://127.0.0.1:11434/api/chat");
  assert.equal(request.options.method, "POST");
  const body = JSON.parse(request.options.body);
  assert.equal(body.stream, false);
  assert.equal(body.messages[0].content, "test prompt");
  assert.equal(result.text, "Local answer");
});

test("maps HTTP failures and timeout aborts to explicit errors", async () => {
  await assert.rejects(() => invokeLocalOllama({
    prompt: "hello",
    fetchImpl: async () => ({ ok: false, status: 503 })
  }), /HTTP 503/);
  await assert.rejects(() => invokeLocalOllama({
    prompt: "hello",
    timeoutMs: 100,
    fetchImpl: async (_url, options) => {
      const error = new Error("aborted");
      error.name = "AbortError";
      assert.ok(options.signal);
      throw error;
    }
  }), /timed out/);
});
