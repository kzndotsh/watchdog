#!/usr/bin/env node
/**
 * Fail when a tagged error class in a workspace package (`Data.TaggedError`,
 * `Schema.TaggedError`, `Schema.TaggedErrorClass`) does not end in `Error`,
 * declares no stable `code`, or reuses another class's `code`.
 *
 * Text scan, like the sibling gates: a class region runs from its
 * declaration to the first line at the same indent that closes it (`}`, or
 * `}> {}` / `}) {}` for an empty body), which is how the formatter lays classes out. Tests and
 * `__tests__` fixtures are skipped.
 *
 * --strict (or CHECK_TAGGED_ERRORS_STRICT=1): exit 1 on any hit.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const strict =
  process.argv.includes("--strict") ||
  process.env.CHECK_TAGGED_ERRORS_STRICT === "1";

const CLASS_DECL =
  /^(\s*)(?:export\s+)?(?:default\s+)?class\s+(\w+)\s+extends\s+(?:Data\.TaggedError|Schema\.TaggedError(?:Class)?)\b/;
const CODE_FIELD =
  /^\s*(?:(?:public|readonly|override)\s+)*code\s*(?::[^=]+)?=\s*["']([^"']+)["']/;
const SKIP_DIRS = new Set(["__tests__", "node_modules", "dist"]);

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function walkTs(dir) {
  /** @type {import("node:fs").Dirent[]} */
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name))
      .map(async (entry) => walkTs(path.join(dir, entry.name)))
  );
  const here = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        !entry.name.includes(".test.")
    )
    .map((entry) => path.join(dir, entry.name));
  return [...here, ...nested.flat()];
}

/**
 * Every `src` tree under `packages/*` and `apps/*`.
 * @returns {Promise<string[]>}
 */
async function sourceRoots() {
  const perParent = await Promise.all(
    ["packages", "apps"].map(async (parent) => {
      const names = await readdir(path.join(root, parent)).catch(() => []);
      return names.map((name) => path.join(root, parent, name, "src"));
    })
  );
  return perParent.flat();
}

/**
 * @param {string[]} lines
 * @param {number} start index of the declaration line
 * @param {string} indent
 * @returns {number} index of the last line of the class region
 */
function classEnd(lines, start, indent) {
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line === `${indent}}`) return i;
    if (line.startsWith(`${indent}}`) && line.endsWith("{}")) return i;
  }
  return lines.length - 1;
}

/**
 * @param {string} abs
 * @returns {Promise<{ msgs: string[]; codes: { code: string; where: string; name: string }[] }>}
 */
async function scanFile(abs) {
  const rel = path.relative(root, abs).split(path.sep).join("/");
  const text = await readFile(abs, "utf-8");
  const lines = text.split("\n");
  /** @type {string[]} */
  const msgs = [];
  /** @type {{ code: string; where: string; name: string }[]} */
  const codes = [];
  for (const [index, line] of lines.entries()) {
    const decl = CLASS_DECL.exec(line);
    if (!decl) continue;
    const [, indent = "", name = ""] = decl;
    const where = `${rel}:${index + 1}`;
    if (!name.endsWith("Error")) {
      msgs.push(`${where}: tagged error class ${name} must end in Error`);
    }
    const end = classEnd(lines, index, indent);
    let code;
    for (const bodyLine of lines.slice(index, end + 1)) {
      code = CODE_FIELD.exec(bodyLine)?.[1];
      if (code !== undefined) break;
    }
    if (code === undefined) {
      msgs.push(
        `${where}: tagged error class ${name} must declare a stable code (readonly code = "..." as const)`
      );
      continue;
    }
    codes.push({ code, where, name });
  }
  return { msgs, codes };
}

const roots = await sourceRoots();
const walked = await Promise.all(roots.map(async (dir) => walkTs(dir)));
const files = walked.flat();
files.sort();
const scanned = await Promise.all(files.map(scanFile));
/** @type {string[]} */
const findings = scanned.flatMap((result) => result.msgs);
/** @type {Map<string, string>} */
const seenCodes = new Map();
for (const { code, where, name } of scanned.flatMap((result) => result.codes)) {
  const first = seenCodes.get(code);
  if (first === undefined) seenCodes.set(code, `${where} (${name})`);
  else {
    findings.push(
      `${where}: tagged error class ${name} reuses code "${code}" already used at ${first}`
    );
  }
}

if (findings.length === 0) {
  console.log(`check:tagged-errors: ok${strict ? " [strict]" : ""}`);
  process.exit(0);
}

for (const msg of findings) {
  console.log(`FAIL  ${msg}`);
}
console.log(
  `check:tagged-errors: ${findings.length} finding(s)${strict ? " [strict]" : " [warn]"}`
);
process.exit(strict ? 1 : 0);
