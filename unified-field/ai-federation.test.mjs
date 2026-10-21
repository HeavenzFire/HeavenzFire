import test from "node:test";
import assert from "node:assert/strict";
import { validateProviderRegistry, planRoute, run } from "./ai-federation.mjs";

const provider = (overrides = {}) => ({
  id: "local-model",
  name: "Local model",
  transport: "local-http",
  status: "catalogued",
  capabilities: ["reasoning", "code"],
  credentialEnv: [],
  dataPolicy: "local-only-by-default",
  adapter: "ollama-adapter-candidate",
  ...overrides,
});
const registry = () => ({
  schemaVersion: 1,
  status: "proposal",
  providers: [provider(), provider({
    id: "cloud-model",
    name: "Cloud model",
    transport: "official-api",
    capabilities: ["reasoning", "multimodal"],
    credentialEnv: ["CLOUD_MODEL_API_KEY"],
    dataPolicy: "external-request-explicit",
  })],
  routing: {
    defaultMode: "plan-only",
    automaticFallback: false,
    requireExplicitExternalDataPolicy: true,
    requireHumanApprovalForConsequentialActions: true,
  },
});

test("accepts the declared provider registry", () => {
  assert.deepEqual(validateProviderRegistry(registry()), []);
});

test("rejects duplicate provider IDs", () => {
  const value = registry();
  value.providers.push(provider());
  assert.ok(validateProviderRegistry(value).some((e) => e.includes("duplicate provider id")));
});

test("rejects a credential value where only an environment-variable name is allowed", () => {
  const value = registry();
  value.providers[0].credentialEnv = ["sk-live-secret"];
  assert.ok(validateProviderRegistry(value).some((e) => e.includes("environment-variable names only")));
});

test("local route plan excludes external-only providers", () => {
  const result = planRoute(registry(), "reasoning", "local");
  assert.deepEqual(result.candidates.map((x) => x.id), ["local-model"]);
  assert.equal(result.executionStarted, false);
});

test("external route plan selects explicit-external candidates only", () => {
  const result = planRoute(registry(), "reasoning", "external");
  assert.deepEqual(result.candidates.map((x) => x.id), ["cloud-model"]);
});

test("route plan excludes blocked and unverified providers", () => {
  const value = registry();
  value.providers[0].status = "blocked";
  value.providers[1].status = "unverified";
  assert.deepEqual(planRoute(value, "reasoning", "local").candidates, []);
  assert.deepEqual(planRoute(value, "reasoning", "external").candidates, []);
});

test("route plan rejects unknown scope", () => {
  assert.throws(() => planRoute(registry(), "reasoning", "anywhere"), /scope must be local or external/);
});

test("CLI validation describes the registry without claiming live connections", () => {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try { assert.equal(run(["validate"], registry()), 0); }
  finally { console.log = original; }
  assert.ok(lines[0].includes("no live connection inferred"));
});
