import test from "node:test";
import assert from "node:assert/strict";
import { loadRegistry, validateRegistry, listModules } from "./registry.mjs";

test("committed module registry loads and validates", async () => {
  const registry = await loadRegistry();
  assert.deepEqual(validateRegistry(registry), []);
  assert.ok(registry.modules.length >= 10);
});

test("module ids are unique", async () => {
  const registry = await loadRegistry();
  registry.modules.push({ ...registry.modules[0] });
  assert.ok(validateRegistry(registry).some(error => error.includes("Duplicate module id")));
});

test("unknown dependency is rejected", async () => {
  const registry = await loadRegistry();
  registry.modules[0].dependencies = ["missing-module"];
  assert.ok(validateRegistry(registry).some(error => error.includes("unknown dependency")));
});

test("dependency cycles are rejected", async () => {
  const registry = await loadRegistry();
  registry.modules[0].dependencies = ["local-mesh"];
  assert.ok(validateRegistry(registry).some(error => error.includes("Dependency cycle detected")));
});

test("credential-like material is rejected", async () => {
  const registry = await loadRegistry();
  registry.modules[0].description = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";
  assert.ok(validateRegistry(registry).some(error => error.includes("credential or private key")));
});

test("list command returns only the declared modules", async () => {
  const registry = await loadRegistry();
  const listed = listModules(registry);
  assert.equal(listed.length, registry.modules.length);
  assert.equal(listed[0].id, "fieldcore");
});
