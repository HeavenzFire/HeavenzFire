#!/usr/bin/env node
import { loadRegistry, validateRegistry, listModules } from "./core/registry.mjs";

const [command = "help"] = process.argv.slice(2);
const registry = await loadRegistry();

function help() {
  console.log("HeavenzFire Unified Field");
  console.log("");
  console.log("Commands:");
  console.log("  node unified-field/uf.mjs validate  Validate the module registry and dependency graph");
  console.log("  node unified-field/uf.mjs list      List registered modules and integration status");
  console.log("  node unified-field/uf.mjs graph     Print module dependency edges");
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
} else {
  console.error(`Unknown command: ${command}`);
  help();
  process.exitCode = 2;
}
