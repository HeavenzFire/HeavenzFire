import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, validateRegistry, listModules, inspectModuleSources } from "./registry.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

test("integrated local control modules map to real repository paths", async () => {
  const registry = await loadRegistry();
  const byId = new Map(registry.modules.map(module => [module.id, module]));
  const required = [
    "health-probe",
    "consent-policy-gate",
    "shared-task-inbox",
    "evidence-ledger",
    "browser-bridge",
    "attention-guard"
  ];
  for (const id of required) {
    const module = byId.get(id);
    assert.ok(module, `missing module registry entry: ${id}`);
    assert.ok(module.sourcePath, `missing sourcePath for ${id}`);
    assert.ok(existsSync(path.resolve(REPO_ROOT, module.sourcePath)), `source path does not exist for ${id}`);
    if (module.launcherPath) {
      assert.ok(existsSync(path.resolve(REPO_ROOT, module.launcherPath)), `launcher path does not exist for ${id}`);
    }
    if (module.reviewPath) {
      assert.ok(existsSync(path.resolve(REPO_ROOT, module.reviewPath)), `review path does not exist for ${id}`);
    }
    if (module.controlPath) {
      assert.ok(existsSync(path.resolve(REPO_ROOT, module.controlPath)), `control path does not exist for ${id}`);
    }
    if (module.submitPath) {
      assert.ok(existsSync(path.resolve(REPO_ROOT, module.submitPath)), `submit path does not exist for ${id}`);
    }
  }
  assert.equal(byId.get("attention-guard").activation, "manual-unverified");
  assert.match(byId.get("attention-guard").status, /manual browser smoke test pending/);
  assert.equal(byId.get("consent-policy-gate").activation, "manual-until-enforced-by-caller");
});

test("source inspection reports present, missing, undeclared, and out-of-repository paths", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "uf-source-status-"));
  try {
    mkdirSync(path.join(root, "src"));
    writeFileSync(path.join(root, "src", "worker.cjs"), "module.exports = {};");
    const registry = { modules: [
      { id: "present", integration: "in-repository", activation: "operator-local", sourcePath: "src/worker.cjs" },
      { id: "missing", integration: "in-repository", activation: "operator-local", sourcePath: "src/missing.cjs" },
      { id: "external", integration: "repository-adapter", activation: "disabled-until-reviewed" },
      { id: "escape", integration: "in-repository", activation: "operator-local", sourcePath: "../outside.cjs" }
    ] };
    const result = inspectModuleSources(registry, root);
    assert.deepEqual(result.map(x => x.sourceState), ["PRESENT", "MISSING", "NOT_DECLARED", "OUTSIDE_REPOSITORY"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
