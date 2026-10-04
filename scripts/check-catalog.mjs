#!/usr/bin/env node
/**
 * Workspace gate: a dependency declared by two or more workspace packages (the root
 * counts) must take its version from the default pnpm catalog in pnpm-workspace.yaml,
 * written as `"name": "catalog:"`. A literal range in one of those packages is how
 * versions drift apart. sherif (`pnpm check:workspace`) covers mismatched literal
 * versions, misplaced dependency types and ordering but cannot ask for the catalog.
 *
 * Also fails when a `catalog:` reference names an entry the catalog does not define.
 * `workspace:` links and peerDependencies are out of scope (peer ranges stay literal
 * so consumers keep a range, not an exact pin).
 *
 *   node scripts/check-catalog.mjs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parse } from "yaml";

const root = path.resolve(import.meta.dirname, "..");

const DEP_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];
const CATALOG_REF = /^catalog:(?<name>.*)$/;

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

/**
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
function asStringMap(value) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, entry] of Object.entries(asRecord(value))) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

const workspaceYaml = asRecord(
  parse(readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf-8"))
);
const namedCatalogs = asRecord(workspaceYaml.catalogs);
const defaultCatalog = asStringMap(
  workspaceYaml.catalog ?? namedCatalogs.default
);

/**
 * Directories matched by the `packages:` globs (only the `dir/*` form is used here).
 * @type {string[]}
 */
const dirs = ["."];
const globs = Array.isArray(workspaceYaml.packages)
  ? workspaceYaml.packages
  : [];
for (const glob of globs) {
  const match = /^(?<parent>[^*]+)\/\*$/.exec(String(glob));
  if (!match?.groups?.parent) {
    console.error(`✗ pnpm-workspace.yaml: unsupported packages glob "${glob}"`);
    process.exit(1);
  }
  const parent = match.groups.parent;
  if (!existsSync(path.join(root, parent))) continue;
  for (const entry of readdirSync(path.join(root, parent)).sort()) {
    dirs.push(`${parent}/${entry}`);
  }
}

/** @type {Map<string, { pkg: string; field: string; spec: string }[]>} */
const declared = new Map();
for (const dir of dirs) {
  const file = path.join(root, dir, "package.json");
  if (!existsSync(file)) continue;
  const manifest = asRecord(JSON.parse(readFileSync(file, "utf-8")));
  const pkg = dir === "." ? "(root)" : dir;
  for (const field of DEP_FIELDS) {
    for (const [name, spec] of Object.entries(asStringMap(manifest[field]))) {
      if (spec.startsWith("workspace:")) continue;
      const uses = declared.get(name) ?? [];
      uses.push({ pkg, field, spec });
      declared.set(name, uses);
    }
  }
}

/** @type {string[]} */
const problems = [];
let shared = 0;

for (const [name, uses] of [...declared].sort(([a], [b]) =>
  a.localeCompare(b)
)) {
  for (const use of uses) {
    const ref = CATALOG_REF.exec(use.spec);
    if (!ref?.groups) continue;
    const catalogName = ref.groups.name ?? "";
    const isDefault = catalogName === "" || catalogName === "default";
    const entries = isDefault
      ? defaultCatalog
      : asStringMap(namedCatalogs[catalogName]);
    if (!(name in entries)) {
      problems.push(
        `${use.pkg}: ${name} uses "${use.spec}" but the ${isDefault ? "default" : catalogName} catalog has no "${name}" entry`
      );
    }
  }
  if (uses.length < 2) continue;
  shared += 1;
  for (const use of uses) {
    if (CATALOG_REF.test(use.spec)) continue;
    const others = uses
      .filter((u) => u !== use)
      .map((u) => u.pkg)
      .join(", ");
    problems.push(
      `${use.pkg}: ${name} is declared by ${uses.length} packages (also ${others}) but uses the literal range "${use.spec}" in ${use.field}; use "${name}": "catalog:" and put the version in pnpm-workspace.yaml`
    );
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`✗ ${p}`);
  console.error(
    "\nShared dependency versions live in the default catalog of pnpm-workspace.yaml. See docs/contributing/ci-gates.md."
  );
  process.exit(1);
}
console.log(
  `check:catalog: ok (${shared} shared dependenc${shared === 1 ? "y" : "ies"} across ${dirs.length} package(s) all use the catalog)`
);
