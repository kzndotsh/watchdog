#!/usr/bin/env node
/**
 * Fail when a workspace package re-exports another workspace package's symbols, so
 * every symbol has one import path and callers import from the owner. Caught forms:
 *
 *   export { X } from "@watchdog/x"       export type { X } from "@watchdog/x"
 *   export * from "@watchdog/x"           export * as ns from "@watchdog/x"
 *   import { X } from "@watchdog/x"; export { X }   (also `export type { X }`)
 *
 * Exempt: tests, and the web primitive wrappers (apps/web/src/shared/ui/primitives),
 * which deliberately re-export a @watchdog/ui component module beside their override.
 *
 *   node scripts/check-workspace-reexports.mjs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const ROOTS = ["apps", "packages"];
const SKIP_DIRS = new Set(["node_modules", "dist", "__tests__"]);
const EXEMPT_DIRS = ["apps/web/src/shared/ui/primitives/"];

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        out.push(...walk(path.join(dir, entry.name)));
      }
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts") &&
      !entry.name.includes(".test.")
    ) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/** @returns {string[]} source files under every apps|packages/<name>/src */
function sourceFiles() {
  /** @type {string[]} */
  const files = [];
  for (const base of ROOTS) {
    const baseDir = path.join(root, base);
    if (!existsSync(baseDir)) {
      continue;
    }
    for (const pkg of readdirSync(baseDir, { withFileTypes: true })) {
      if (!pkg.isDirectory()) {
        continue;
      }
      try {
        files.push(...walk(path.join(baseDir, pkg.name, "src")));
      } catch {
        // package without src/
      }
    }
  }
  return files;
}

/** Blank out comments, keeping offsets and newlines so line numbers stay true. */
/**
 * @param {string} text
 * @returns {string}
 */
const stripComments = (text) =>
  text.replaceAll(/\/\*[\s\S]*?\*\/|(?<![:"'`])\/\/[^\n]*/g, (m) =>
    m.replaceAll(/[^\n]/g, " ")
  );

const IMPORT =
  /\bimport\s+(?:type\s+)?(?<clause>[^;"']*?)\s*from\s*["'](?<spec>@watchdog\/[^"']+)["']/g;
const EXPORT_FROM =
  /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s*from\s*["'](?<spec>@watchdog\/[^"']+)["']/g;
const EXPORT_LOCAL =
  /\bexport\s+(?:type\s+)?\{(?<names>[^}]*)\}(?<from>\s*from\b)?/g;
const EXPORT_DEFAULT = /\bexport\s+default\s+(?<name>[A-Za-z_$][\w$]*)\s*;/g;

/**
 * @param {string} clause import clause, e.g. `Foo, { a, type b as c }` or `* as ns`
 * @returns {string[]} local binding names
 */
function localNames(clause) {
  const names = [];
  const braces = /\{([^}]*)\}/.exec(clause);
  const rest = clause.replace(/\{[^}]*\}/, "");
  for (const part of braces ? braces[1].split(",") : []) {
    const m =
      /(?:^|\s)(?:type\s+)?(?:[\w$]+\s+as\s+)?(?<local>[\w$]+)\s*$/.exec(part);
    if (m?.groups?.local) {
      names.push(m.groups.local);
    }
  }
  for (const part of rest.split(",")) {
    const m = /(?:\*\s*as\s+)?(?<local>[\w$]+)\s*$/.exec(part.trim());
    if (m?.groups?.local) {
      names.push(m.groups.local);
    }
  }
  return names;
}

/**
 * @param {string} file absolute path
 * @returns {string[]} violation messages
 */
function inspect(file) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  if (EXEMPT_DIRS.some((dir) => rel.startsWith(dir))) {
    return [];
  }
  const text = stripComments(readFileSync(file, "utf-8"));
  /** @type {Map<string, string>} local name -> workspace module it came from */
  const imported = new Map();
  /** @type {string[]} */
  const found = [];
  /**
   * @param {number} index
   * @param {string} what
   */
  const report = (index, what) => {
    const line = text.slice(0, index).split("\n").length;
    found.push(`${rel}:${line}: ${what}`);
  };

  for (const m of text.matchAll(IMPORT)) {
    for (const name of localNames(m.groups?.clause ?? "")) {
      imported.set(name, m.groups?.spec ?? "");
    }
  }
  for (const m of text.matchAll(EXPORT_FROM)) {
    report(m.index, `re-exports from ${m.groups?.spec}`);
  }
  for (const m of text.matchAll(EXPORT_LOCAL)) {
    if (m.groups?.from) {
      continue;
    }
    for (const item of (m.groups?.names ?? "").split(",")) {
      const local = /^\s*(?:type\s+)?([\w$]+)/.exec(item)?.[1];
      const from = local && imported.get(local);
      if (from) {
        report(m.index, `re-exports ${local} imported from ${from}`);
      }
    }
  }
  for (const m of text.matchAll(EXPORT_DEFAULT)) {
    const from = imported.get(m.groups?.name ?? "");
    if (from) {
      report(m.index, `re-exports ${m.groups?.name} imported from ${from}`);
    }
  }
  return found;
}

const violations = sourceFiles().flatMap(inspect);

if (violations.length > 0) {
  console.error(
    `check:workspace-reexports: a workspace package must not re-export another workspace package; import the symbol from its owner instead.\n${violations.map((v) => `  ${v}`).join("\n")}`
  );
  process.exit(1);
}
console.log("check:workspace-reexports: ok");
