import test from "node:test";
import assert from "node:assert/strict";
import { validateManifest, run } from "./env-fabric.mjs";

const validProfile = {
  id: "test-profile",
  label: "Test profile",
  backend: "github-actions",
  runtime: "node>=18",
  workspace: "repository",
  network: "disabled",
  capabilities: ["read-repository"],
  limits: { timeoutSeconds: 30, maxOutputBytes: 1024, maxConcurrentTasks: 1 },
  status: "defined",
  approval: "not-required-for-ci",
};
const validManifest = () => ({
  schemaVersion: 1,
  status: "proposal",
  profiles: [{ ...validProfile, limits: { ...validProfile.limits }, capabilities: [...validProfile.capabilities] }],
});

test("accepts a valid declared profile", () => {
  assert.deepEqual(validateManifest(validManifest()), []);
});

test("rejects duplicate profile IDs", () => {
  const manifest = validManifest();
  manifest.profiles.push({ ...validProfile });
  assert.ok(validateManifest(manifest).some((error) => error.includes("duplicate profile id")));
});

test("rejects non-positive resource limits", () => {
  const manifest = validManifest();
  manifest.profiles[0].limits.timeoutSeconds = 0;
  assert.ok(validateManifest(manifest).some((error) => error.includes("timeoutSeconds")));
});

test("rejects unsupported profile status", () => {
  const manifest = validManifest();
  manifest.profiles[0].status = "running";
  assert.ok(validateManifest(manifest).some((error) => error.includes("status is unsupported")));
});

test("rejects an unknown network policy", () => {
  const manifest = validManifest();
  manifest.profiles[0].network = "unrestricted";
  assert.ok(validateManifest(manifest).some((error) => error.includes("network")));
});

test("list reports declarations without asserting they are running", () => {
  const messages = [];
  const oldLog = console.log;
  console.log = (message) => messages.push(String(message));
  try {
    assert.equal(run("list", validManifest()), 0);
  } finally {
    console.log = oldLog;
  }
  assert.ok(messages.some((line) => line.includes("not running sandboxes")));
});
