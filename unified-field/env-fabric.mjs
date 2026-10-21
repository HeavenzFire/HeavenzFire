#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MANIFEST = fileURLToPath(
  new URL("../UnifiedField/sandboxes/manifest.example.json", import.meta.url),
);
const PROFILE_STATUSES = new Set(["defined", "proposed", "blocked", "retired"]);
const NETWORK_POLICIES = new Set(["disabled", "allowlisted"]);
const APPROVAL_POLICIES = new Set([
  "required-for-all-execution",
  "required-for-external-effects",
  "not-required-for-ci",
]);

export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return ["manifest must be a JSON object"];
  }
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
  if (!["proposal", "active", "blocked"].includes(manifest.status)) {
    errors.push("manifest status must be proposal, active, or blocked");
  }
  if (!Array.isArray(manifest.profiles)) {
    errors.push("profiles must be an array");
    return errors;
  }

  const seen = new Set();
  for (const [index, profile] of manifest.profiles.entries()) {
    const at = `profiles[${index}]`;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      errors.push(`${at} must be an object`);
      continue;
    }
    if (typeof profile.id !== "string" || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(profile.id)) {
      errors.push(`${at}.id must be a 2-63 character lowercase slug`);
    } else if (seen.has(profile.id)) {
      errors.push(`duplicate profile id: ${profile.id}`);
    } else {
      seen.add(profile.id);
    }
    for (const field of ["label", "backend", "runtime", "workspace"]) {
      if (typeof profile[field] !== "string" || profile[field].trim() === "") {
        errors.push(`${at}.${field} must be a non-empty string`);
      }
    }
    if (!NETWORK_POLICIES.has(profile.network)) {
      errors.push(`${at}.network must be disabled or allowlisted`);
    }
    if (!PROFILE_STATUSES.has(profile.status)) {
      errors.push(`${at}.status is unsupported`);
    }
    if (!APPROVAL_POLICIES.has(profile.approval)) {
      errors.push(`${at}.approval is unsupported`);
    }
    if (!Array.isArray(profile.capabilities) ||
        profile.capabilities.some((item) => typeof item !== "string" || !item.trim())) {
      errors.push(`${at}.capabilities must be an array of non-empty strings`);
    }
    const limits = profile.limits;
    if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
      errors.push(`${at}.limits must be an object`);
      continue;
    }
    for (const field of ["timeoutSeconds", "maxOutputBytes", "maxConcurrentTasks"]) {
      if (!Number.isSafeInteger(limits[field]) || limits[field] < 1) {
        errors.push(`${at}.limits.${field} must be a positive safe integer`);
      }
    }
  }
  return errors;
}

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  let manifestPath = DEFAULT_MANIFEST;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--manifest" && rest[i + 1]) {
      manifestPath = path.resolve(rest[++i]);
    } else {
      throw new Error(`unknown argument: ${rest[i]}`);
    }
  }
  return { command, manifestPath };
}

function loadManifest(manifestPath) {
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, "utf8");
  } catch (error) {
    throw new Error(`cannot read manifest ${manifestPath}: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid JSON in ${manifestPath}: ${error.message}`);
  }
}

function help() {
  console.log("HeavenzFire Environment Fabric (registry-only; does not launch sandboxes)");
  console.log("Usage: node unified-field/env-fabric.mjs <validate|list|graph> [--manifest path]");
}

export function run(command, manifest) {
  const errors = validateManifest(manifest);
  if (command === "validate") {
    if (errors.length) {
      console.error(errors.map((error) => `- ${error}`).join("\n"));
      return 1;
    }
    console.log(`VALID: ${manifest.profiles.length} declared profiles; no runtime state inferred`);
    return 0;
  }
  if (errors.length) {
    console.error("Manifest invalid; run validate first.");
    return 1;
  }
  if (command === "list") {
    for (const profile of manifest.profiles) {
      console.log(`${profile.id}\t${profile.status}\t${profile.backend}\t${profile.label}`);
    }
    console.log("Note: listed profiles are declarations, not running sandboxes.");
    return 0;
  }
  if (command === "graph") {
    console.log("Control plane: Unified Field CLI -> versioned profile manifest");
    for (const profile of manifest.profiles) {
      console.log(`  -> ${profile.id} -> backend=${profile.backend}, network=${profile.network}`);
    }
    console.log("No execution backend or live connectivity is implied by this graph.");
    return 0;
  }
  if (command === "help" || command === "--help" || command === "-h") {
    help();
    return 0;
  }
  console.error(`unknown command: ${command}`);
  help();
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { command, manifestPath } = parseArgs(process.argv.slice(2));
    process.exitCode = run(command, loadManifest(manifestPath));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
