import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY = path.resolve(HERE, "..", "modules.json");

export async function loadRegistry(file = DEFAULT_REGISTRY) {
  const raw = await readFile(file, "utf8");
  let registry;
  try {
    registry = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Registry JSON is invalid: ${error.message}`);
  }
  return registry;
}

export function validateRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    return ["Registry must be a JSON object."];
  }
  if (registry.schema !== "heavenzfire.unified-field.modules.v1") {
    errors.push("Unsupported or missing registry schema.");
  }
  if (!Array.isArray(registry.modules) || registry.modules.length === 0) {
    errors.push("Registry must contain a non-empty modules array.");
    return errors;
  }

  const byId = new Map();
  for (const [index, module] of registry.modules.entries()) {
    const where = `modules[${index}]`;
    if (!module || typeof module !== "object" || Array.isArray(module)) {
      errors.push(`${where} must be an object.`);
      continue;
    }
    if (typeof module.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(module.id)) {
      errors.push(`${where}.id must be a lowercase kebab-case identifier.`);
    } else if (byId.has(module.id)) {
      errors.push(`Duplicate module id: ${module.id}.`);
    } else {
      byId.set(module.id, module);
    }
    for (const key of ["name", "repository", "kind", "integration", "status", "activation"]) {
      if (typeof module[key] !== "string" || module[key].trim() === "") {
        errors.push(`${where}.${key} must be a non-empty string.`);
      }
    }
    if (typeof module.repository === "string" &&
        !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(module.repository)) {
      errors.push(`${where}.repository must use owner/repository format.`);
    }
    if (!Array.isArray(module.dependencies) ||
        module.dependencies.some(dependency => typeof dependency !== "string")) {
      errors.push(`${where}.dependencies must be an array of module ids.`);
    }
    if (!Array.isArray(module.capabilities) ||
        module.capabilities.some(capability => typeof capability !== "string" || !capability.trim())) {
      errors.push(`${where}.capabilities must be an array of non-empty strings.`);
    }
    const serialized = JSON.stringify(module);
    if (/(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(serialized)) {
      errors.push(`${where} appears to contain a credential or private key; remove it.`);
    }
  }

  for (const module of byId.values()) {
    for (const dependency of module.dependencies ?? []) {
      if (!byId.has(dependency)) errors.push(`Module ${module.id} references unknown dependency ${dependency}.`);
      if (dependency === module.id) errors.push(`Module ${module.id} cannot depend on itself.`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  function visit(id, trail = []) {
    if (visiting.has(id)) {
      errors.push(`Dependency cycle detected: ${[...trail, id].join(" -> ")}.`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const module = byId.get(id);
    for (const dependency of module?.dependencies ?? []) {
      if (byId.has(dependency)) visit(dependency, [...trail, id]);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);

  return [...new Set(errors)];
}

export function listModules(registry) {
  return registry.modules.map(module => ({
    id: module.id,
    name: module.name,
    repository: module.repository,
    integration: module.integration,
    activation: module.activation,
    capabilities: module.capabilities
  }));
}

export async function validateFile(file = DEFAULT_REGISTRY) {
  return validateRegistry(await loadRegistry(file));
}

export { DEFAULT_REGISTRY };
