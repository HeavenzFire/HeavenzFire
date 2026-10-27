#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, validateRegistry, listModules, inspectModuleSources } from "./core/registry.mjs";

const [command = "help"] = process.argv.slice(2);
const registry = await loadRegistry();
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function help() {
  console.log("HeavenzFire Unified Field");
  console.log("");
  console.log("Commands:");
  console.log("  node unified-field/uf.mjs validate  Validate the module registry and dependency graph");
  console.log("  node unified-field/uf.mjs list      List registered modules and integration status");
  console.log("  node unified-field/uf.mjs graph     Print module dependency edges");
  console.log("  node unified-field/uf.mjs status    Check declared local source paths (not service health)");
}

if (command === "help" || command === "--help" || command === "-h") {
  help();
} else if (command === "validate") {
  const errors = validateRegistry(registry);
  if (errors.length) {
    console.error("UNIFIED_FIELD_INVALID");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`UNIFIED_FIELD_VALID modules=${registry.modules.length}`);
  }
} else if (command === "list") {
  for (const module of listModules(registry)) {
    console.log(`${module.id}\t${module.integration}\t${module.activation}\t${module.repository}\t${module.name}`);
  }
} else if (command === "graph") {
  for (const module of registry.modules) {
    for (const dependency of module.dependencies) {
      console.log(`${module.id} -> ${dependency}`);
    }
  }
} else if (command === "status") {
  const results = inspectModuleSources(registry, REPO_ROOT);
  let present = 0, missing = 0, undeclared = 0, unsafe = 0;
  for (const item of results) {
    if (item.sourceState === "PRESENT") present++;
    else if (item.sourceState === "MISSING") missing++;
    else if (item.sourceState === "NOT_DECLARED") undeclared++;
    else if (item.sourceState === "OUTSIDE_REPOSITORY") unsafe++;
    console.log(`${item.id}\t${item.sourceState}\t${item.activation}\t${item.sourcePath || "-"}`);
  }
  console.log(`SOURCE_STATUS modules=${results.length} present=${present} missing=${missing} undeclared=${undeclared} outside_repository=${unsafe}`);
  const blocking = results.filter(item =>
    item.sourceState === "OUTSIDE_REPOSITORY" ||
    (item.sourceState === "MISSING" && item.integration === "in-repository")
  );
  if (blocking.length) {
    console.error("UNIFIED_FIELD_SOURCE_STATUS_FAILED");
    process.exitCode = 1;
  } else {
    console.log("NOTE: source presence is not proof that a service is running or an integration is verified.");
  }
} else {
  console.error(`Unknown command: ${command}`);
  help();
  process.exitCode = 2;
}
