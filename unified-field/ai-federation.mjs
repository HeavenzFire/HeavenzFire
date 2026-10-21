#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REGISTRY = fileURLToPath(new URL("../UnifiedField/ai-providers.json", import.meta.url));
const VALID_STATUSES = new Set(["catalogued", "configured", "smoke-tested", "contract-verified", "unverified", "blocked"]);
const VALID_POLICIES = new Set(["local-only-by-default", "local-first", "external-request-explicit"]);

export function validateProviderRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) return ["registry must be an object"];
  if (registry.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
  if (!["proposal", "active", "blocked"].includes(registry.status)) errors.push("status must be proposal, active, or blocked");
  if (!Array.isArray(registry.providers)) return [...errors, "providers must be an array"];
  const seen = new Set();
  for (const [i, provider] of registry.providers.entries()) {
    const at = `providers[${i}]`;
    if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (typeof provider.id !== "string" || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(provider.id)) errors.push(`${at}.id must be a lowercase slug`);
    else if (seen.has(provider.id)) errors.push(`duplicate provider id: ${provider.id}`);
    else seen.add(provider.id);
    for (const key of ["name", "transport", "adapter"]) {
      if (typeof provider[key] !== "string" || !provider[key].trim()) errors.push(`${at}.${key} must be a non-empty string`);
    }
    if (!VALID_STATUSES.has(provider.status)) errors.push(`${at}.status is unsupported`);
    if (!Array.isArray(provider.capabilities) || provider.capabilities.length === 0 ||
        provider.capabilities.some((x) => typeof x !== "string" || !x.trim())) errors.push(`${at}.capabilities must be non-empty strings`);
    if (!Array.isArray(provider.credentialEnv) ||
        provider.credentialEnv.some((x) => typeof x !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(x))) errors.push(`${at}.credentialEnv must contain environment-variable names only`);
    if (!VALID_POLICIES.has(provider.dataPolicy)) errors.push(`${at}.dataPolicy is unsupported`);
  }
  const routing = registry.routing;
  if (!routing || typeof routing !== "object" || Array.isArray(routing)) errors.push("routing must be an object");
  else {
    if (typeof routing.automaticFallback !== "boolean") errors.push("routing.automaticFallback must be boolean");
    if (typeof routing.requireExplicitExternalDataPolicy !== "boolean") errors.push("routing.requireExplicitExternalDataPolicy must be boolean");
    if (typeof routing.requireHumanApprovalForConsequentialActions !== "boolean") errors.push("routing.requireHumanApprovalForConsequentialActions must be boolean");
  }
  return errors;
}

export function planRoute(registry, capability, scope = "local") {
  if (typeof capability !== "string" || !capability.trim()) throw new Error("capability must be a non-empty string");
  if (!["local", "external"].includes(scope)) throw new Error("scope must be local or external");
  const errors = validateProviderRegistry(registry);
  if (errors.length) throw new Error(`invalid provider registry: ${errors.join("; ")}`);
  const candidates = registry.providers.filter((p) =>
    p.capabilities.includes(capability) &&
    !["blocked", "unverified"].includes(p.status) &&
    (scope === "local"
      ? ["local-only-by-default", "local-first"].includes(p.dataPolicy)
      : p.dataPolicy === "external-request-explicit")
  );
  return {
    mode: "plan-only",
    capability,
    scope,
    candidates: candidates.map((p) => ({ id: p.id, transport: p.transport, status: p.status, adapter: p.adapter })),
    executionStarted: false,
    note: "Candidates are registry matches, not proof of connectivity. No provider was called."
  };
}

function loadRegistry(file) {
  let raw;
  try { raw = fs.readFileSync(file, "utf8"); }
  catch (error) { throw new Error(`cannot read registry ${file}: ${error.message}`); }
  try { return JSON.parse(raw); }
  catch (error) { throw new Error(`invalid JSON in ${file}: ${error.message}`); }
}

function help() {
  console.log("HeavenzFire AI Federation (registry and routing plan only; no provider calls)");
  console.log("Usage: node unified-field/ai-federation.mjs <validate|list|plan> [capability] [--scope local|external] [--registry path]");
}

export function run(argv, registry) {
  const [command = "help", ...args] = argv;
  let scope = "local";
  let registryPath = DEFAULT_REGISTRY;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--scope" && args[i + 1]) scope = args[++i];
    else if (args[i] === "--registry" && args[i + 1]) registryPath = path.resolve(args[++i]);
    else if (args[i].startsWith("--")) { console.error(`unknown argument: ${args[i]}`); return 2; }
    else positional.push(args[i]);
  }
  if (command === "help" || command === "--help" || command === "-h") { help(); return 0; }
  const loaded = registry ?? loadRegistry(registryPath);
  if (command === "validate") {
    const errors = validateProviderRegistry(loaded);
    if (errors.length) { console.error(errors.map((e) => `- ${e}`).join("\n")); return 1; }
    console.log(`VALID: ${loaded.providers.length} providers catalogued; no live connection inferred`);
    return 0;
  }
  if (command === "list") {
    const errors = validateProviderRegistry(loaded);
    if (errors.length) { console.error(errors.join("\n")); return 1; }
    for (const p of loaded.providers) console.log(`${p.id}\t${p.status}\t${p.transport}\t${p.name}`);
    console.log("Listed records are declarations, not live provider connections.");
    return 0;
  }
  if (command === "plan") {
    try {
      const result = planRoute(loaded, positional[0], scope);
      console.log(JSON.stringify(result, null, 2));
      return 0;
    } catch (error) { console.error(error.message); return 1; }
  }
  console.error(`unknown command: ${command}`);
  help();
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = run(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}
