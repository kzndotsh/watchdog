#!/usr/bin/env node
/**
 * Package-boundary gate. Every source file under apps/* and packages/* must keep to
 * three rules about `@watchdog/*` imports:
 *
 *   1. Declared: the importing package lists the target in its package.json
 *      (dependencies, devDependencies, peerDependencies or optionalDependencies).
 *      pnpm's strict node_modules makes an undeclared import fail only where it is
 *      resolved, so a missing line can hide until runtime or a bundler.
 *   2. Public: the import path matches an entry of the target's `exports` map. An
 *      internal path (`@watchdog/core/src/...`) or a relative path into another
 *      workspace directory (`../../core/src/...`) fails and the message lists the
 *      public entry points.
 *   3. Downward: apps are leaves. No package or other app imports an app.
 *
 * What the other tools cover (audit in docs/contributing/ci-gates.md): knip reports
 * unlisted dependencies only in CI and knows nothing of `exports`; oxlint
 * `no-restricted-imports` bans specific names in specific trees; `import/no-cycle`
 * catches cycles. None of them checks all three rules above.
 *
 *   node scripts/check-boundaries.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { parse } from "yaml";

const root = path.resolve(import.meta.dirname, "..");
const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
];
const SCOPE = "@watchdog/";

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

/** @param {string} file */
function readJson(file) {
  return asRecord(JSON.parse(readFileSync(file, "utf-8")));
}

const workspaceYaml = asRecord(
  parse(readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf-8"))
);

/**
 * @typedef {{
 *   dir: string,
 *   name: string,
 *   isApp: boolean,
 *   declared: Set<string>,
 *   exportKeys: string[],
 * }} Pkg
 */

/** @type {Pkg[]} */
const packages = [];
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
    const dir = `${parent}/${entry}`;
    const file = path.join(root, dir, "package.json");
    if (!existsSync(file)) continue;
    const manifest = readJson(file);
    const exportsField = manifest.exports;
    const exportKeys =
      exportsField !== null && typeof exportsField === "object"
        ? Object.keys(exportsField)
        : ["."];
    packages.push({
      dir,
      name: typeof manifest.name === "string" ? manifest.name : dir,
      isApp: parent === "apps",
      declared: new Set(
        DEP_FIELDS.flatMap((f) => Object.keys(asRecord(manifest[f])))
      ),
      // Conditional-only maps (`{ import, default }`) describe the root entry.
      exportKeys: exportKeys.some((k) => k.startsWith("."))
        ? exportKeys.filter((k) => k.startsWith("."))
        : ["."],
    });
  }
}
const byName = new Map(packages.map((p) => [p.name, p]));

/**
 * @param {Pkg} pkg
 * @param {string} subpath "." or "./x/y"
 */
function isExported(pkg, subpath) {
  return pkg.exportKeys.some((key) => {
    if (!key.includes("*")) return key === subpath;
    const [head, tail = ""] = key.split("*");
    return (
      subpath.length > (head?.length ?? 0) + tail.length &&
      subpath.startsWith(head ?? "") &&
      subpath.endsWith(tail)
    );
  });
}

/** @param {Pkg} pkg */
function entryPoints(pkg) {
  return pkg.exportKeys
    .map((k) => (k === "." ? `"${pkg.name}"` : `"${pkg.name}/${k.slice(2)}"`))
    .join(", ");
}

/**
 * The one sanctioned relative reach into another package: the generated client
 * AppRouter type alias, which keeps `@watchdog/client` free of an `@watchdog/api`
 * dependency (packages/client/AGENTS.md).
 */
const RELATIVE_ALLOWED = new Set([
  "packages/client/src/generated/app-router.ts",
]);

/**
 * Specifier string literals, matched over the whole file text so a specifier on its
 * own line (`import(\n "m"\n)`, `vi.mock(\n "m",`, `} from "m"` closing a multi-line
 * clause) is found like a one-line import.
 */
const SPECIFIER_PATTERNS = [
  // `import x from "m"`, `export * from "m"`, `import type { a } from "m"`, `} from "m"`.
  /\bfrom\s*["'](?<spec>[^"'\n]+)["']/g,
  // Side-effect `import "m"`.
  /\bimport\s*["'](?<spec>[^"'\n]+)["']/g,
  /\b(?:import|require)\s*\(\s*["'](?<spec>[^"'\n]+)["']/g,
  /\bvi\.(?:mock|doMock|importActual|importMock)\s*\(\s*["'](?<spec>[^"'\n]+)["']/g,
];

/**
 * @param {string} source
 * @returns {{ line: number, spec: string }[]}
 */
function importsOf(source) {
  const lines = source.split("\n");
  /** @type {Map<number, { line: number, spec: string }>} keyed by match offset */
  const found = new Map();
  for (const re of SPECIFIER_PATTERNS) {
    for (const m of source.matchAll(re)) {
      const spec = m.groups?.spec;
      if (!spec) continue;
      const line = source.slice(0, m.index).split("\n").length;
      // Skip matches that sit on a comment line.
      if (/^\s*(?:\/\/|\*|\/\*)/.test(lines[line - 1] ?? "")) continue;
      found.set(m.index + m[0].indexOf(spec), { line, spec });
    }
  }
  return [...found.values()].sort((x, y) => x.line - y.line);
}

const listed = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }
)
  .split("\0")
  .filter(Boolean);

/** @type {string[]} */
const problems = [];
let scanned = 0;

for (const rel of listed) {
  if (!SOURCE.test(rel)) continue;
  const owner = packages.find((p) => rel.startsWith(`${p.dir}/`));
  if (!owner || !existsSync(path.join(root, rel))) continue;
  scanned += 1;
  const source = readFileSync(path.join(root, rel), "utf-8");
  for (const { line, spec } of importsOf(source)) {
    const where = `${rel}:${line}`;

    if (spec.startsWith(".")) {
      if (RELATIVE_ALLOWED.has(rel)) continue;
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(rel), spec)
      );
      const other = packages.find(
        (p) =>
          p !== owner && (target === p.dir || target.startsWith(`${p.dir}/`))
      );
      if (other) {
        problems.push(
          `${where}: relative import "${spec}" reaches into ${other.name}; import it through its public entry points: ${entryPoints(other)}`
        );
      }
      continue;
    }

    if (!spec.startsWith(SCOPE)) continue;
    const [scope = "", pkgName = "", ...rest] = spec.split("/");
    const name = `${scope}/${pkgName}`;
    if (name === owner.name) continue;
    const target = byName.get(name);
    if (!target) {
      problems.push(`${where}: "${spec}": no workspace package named ${name}`);
      continue;
    }
    if (target.isApp) {
      problems.push(
        `${where}: "${spec}": ${name} is an app; apps are never imported (move shared code into a package under packages/)`
      );
      continue;
    }
    if (!owner.declared.has(name)) {
      problems.push(
        `${where}: ${owner.dir} does not declare ${name}; add "${name}": "workspace:*" to ${owner.dir}/package.json (or drop the import)`
      );
      continue;
    }
    const subpath = rest.length === 0 ? "." : `./${rest.join("/")}`;
    if (!isExported(target, subpath)) {
      problems.push(
        `${where}: "${spec}" is not a public entry of ${name}; import from one of: ${entryPoints(target)}`
      );
    }
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`✗ ${p}`);
  console.error(
    "\nPackages import only declared workspace packages, only through their package.json exports; apps are never imported. See docs/contributing/ci-gates.md."
  );
  process.exit(1);
}
console.log(
  `check:boundaries: ok (${scanned} source files across ${packages.length} workspace packages)`
);
