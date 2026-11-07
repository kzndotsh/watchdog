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
 *   4. Tools know no Cap: a production source file of packages/tools/src (not `__tests__`,
 *      `testing/` or a test file) holds no Cap id and no Vault slot name as a string
 *      literal. A Cap hands its facts to a tool as parameters (the user agent, the key
 *      value); the lists are read from packages/caps/capabilities.gen.json (Cap ids and
 *      declared credentials, `anyOf` groups included).
 *   5. Core folders form no import cycle: the top-level folders of packages/core/src
 *      (`activity`, `cases`, `jobs`, ...) depend on one another in one direction only, so a
 *      concept lives in the folder that owns it. Tests (`__tests__`, `*.test.ts`) are not
 *      counted; files directly under src (`vault-rekey-cli.ts`) are entry points, not folders.
 *      Edges that may close a cycle are named in CORE_CYCLE_ALLOWLIST (empty today).
 *   6. Infra holds no domain: a non-test file of `packages/core/src/infra/` imports no core
 *      folder but `errors` (the error vocabulary, not a domain). Infra is the leaf the domain
 *      folders stand on; anything that needs a domain folder belongs in that folder.
 *   7. Web domains form no import cycle: the folders of apps/web/src/domains (`jobs`,
 *      `cases`, ...) depend on one another in one direction only, so a piece two domains
 *      use lives with its owner (or in `shared/` when it is generic). Tests are not counted.
 *      The message names the cycle with one import per edge.
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
 *   exportTargets: Record<string, unknown>,
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
      /** Subpath -> file, for the string-valued entries (a self-import is resolved through them). */
      exportTargets: Object.fromEntries(
        Object.entries(asRecord(exportsField)).filter(
          ([, value]) => typeof value === "string"
        )
      ),
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
 * Core folder edges (`from -> to`) that may close an import cycle. Each is a known violation
 * waiting on the issue that removes it; the gate ignores these edges only, fails on any other
 * cycle, and fails when an entry no longer matches an import (so the entry is deleted with the fix).
 * Empty since #617; the mechanism stays for the next known violation.
 * @type {Set<string>}
 */
const CORE_CYCLE_ALLOWLIST = new Set();
/** The one core folder infra may import: the error vocabulary every layer shares. */
const INFRA_MAY_IMPORT = new Set(["errors"]);
/** @type {string[]} */
const infraImportProblems = [];
const CORE_SRC = "packages/core/src/";
/** A non-test file inside a top-level folder of core's src. */
const CORE_FOLDER_FILE =
  /^packages\/core\/src\/(?<folder>[^/]+)\/(?!(?:.*\/)?(?:__tests__|__fixtures__|testing)\/|.*\.test\.[jt]sx?$)/;

const WEB_SRC = "apps/web/src/";
const WEB_DOMAINS = `${WEB_SRC}domains/`;
/** A non-test file inside a web domain folder. */
const WEB_DOMAIN_FILE =
  /^apps\/web\/src\/domains\/(?<domain>[^/]+)\/(?!(?:.*\/)?(?:__tests__|__fixtures__|testing)\/|.*\.test\.[jt]sx?$)/;
/** @type {Map<string, string>} "from -> to" -> first file:line and specifier that makes it */
const webEdges = new Map();

/**
 * @param {string} rel the importing file
 * @param {string} spec the import specifier (`@/` alias or relative)
 * @param {string} where file:line of the import
 */
function recordWebEdge(rel, spec, where) {
  const from = WEB_DOMAIN_FILE.exec(rel)?.groups?.domain;
  if (from === undefined) return;
  let target = "";
  if (spec.startsWith("@/")) target = `${WEB_SRC}${spec.slice(2)}`;
  else if (spec.startsWith(".")) {
    target = path.posix.normalize(
      path.posix.join(path.posix.dirname(rel), spec)
    );
  }
  if (!target.startsWith(WEB_DOMAINS)) return;
  const to = target.slice(WEB_DOMAINS.length).split("/")[0];
  if (to === undefined || to === "" || to === from) return;
  const key = `${from} -> ${to}`;
  if (!webEdges.has(key)) webEdges.set(key, `${where} "${spec}"`);
}

/** The top-level folders of core's src, from the tracked files. */
const coreFolders = new Set();

/** @type {Map<string, string>} "from -> to" -> first file:line and specifier that makes it */
const coreEdges = new Map();

/**
 * @param {string} rel the importing file
 * @param {string} target the resolved import, repo-relative
 * @param {string} where file:line of the import
 * @param {string} spec
 */
function recordCoreEdge(rel, target, where, spec) {
  const from = CORE_FOLDER_FILE.exec(rel)?.groups?.folder;
  if (from === undefined || !target.startsWith(CORE_SRC)) return;
  const to = target.slice(CORE_SRC.length).split("/")[0];
  // `../jobs` (a folder's index) names the folder; a file beside the folders (`../vault-rekey-cli`) is not a folder.
  if (to === undefined || to === from || !coreFolders.has(to)) return;
  if (from === "infra" && !INFRA_MAY_IMPORT.has(to)) {
    infraImportProblems.push(
      `${where}: "${spec}": infra holds no domain, so it may not import the ${to} folder; move the code that needs ${to} into ${to}/ (or the shared piece down into infra/)`
    );
  }
  const key = `${from} -> ${to}`;
  if (!coreEdges.has(key)) coreEdges.set(key, `${where} "${spec}"`);
}

/**
 * Strongly connected groups of two or more folders (Tarjan), over the edges not allowed.
 * @param {string[]} edgeKeys "from -> to"
 * @returns {string[][]}
 */
function importCycles(edgeKeys) {
  /** @type {Map<string, string[]>} */
  const graph = new Map();
  for (const key of edgeKeys) {
    const [from = "", to = ""] = key.split(" -> ");
    graph.set(from, [...(graph.get(from) ?? []), to]);
  }
  /** @type {Map<string, number>} */
  const index = new Map();
  /** @type {Map<string, number>} */
  const low = new Map();
  /** @type {string[]} */
  const stack = [];
  const onStack = new Set();
  /** @type {string[][]} */
  const groups = [];
  /** @param {string} v */
  const visit = (v) => {
    index.set(v, index.size);
    low.set(v, index.get(v) ?? 0);
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) ?? 0, low.get(w) ?? 0));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v) ?? 0, index.get(w) ?? 0));
      }
    }
    if (low.get(v) === index.get(v)) {
      /** @type {string[]} */
      const group = [];
      let w;
      do {
        w = stack.pop() ?? v;
        onStack.delete(w);
        group.push(w);
      } while (w !== v);
      if (group.length > 1) groups.push(group.sort());
    }
  };
  for (const v of [...graph.keys()].sort()) if (!index.has(v)) visit(v);
  return groups;
}

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
  // Dynamic `import(...)` / `require(...)`, block comments allowed before the specifier.
  /\b(?:import|require)\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)*["'](?<spec>[^"'\n]+)["']/g,
  /\bvi\.(?:mock|doMock|importActual|importMock)\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)*["'](?<spec>[^"'\n]+)["']/g,
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

/** Cap ids and Vault slot names, read from the Cap sources of truth, never copied here. */
function capFacts() {
  const gen = path.join(root, "packages/caps/capabilities.gen.json");
  if (!existsSync(gen)) {
    console.error("✗ the tools rule needs packages/caps/capabilities.gen.json");
    process.exit(1);
  }
  /** @type {unknown} */
  const caps = JSON.parse(readFileSync(gen, "utf-8"));
  /** @type {Map<string, string>} literal -> what it names */
  const facts = new Map();
  for (const cap of Array.isArray(caps) ? caps : []) {
    const entry = asRecord(cap);
    if (typeof entry.id === "string") facts.set(entry.id, "Cap id");
    for (const cred of Array.isArray(entry.credentials)
      ? entry.credentials
      : []) {
      const spec = asRecord(cred);
      const names = Array.isArray(spec.anyOf) ? spec.anyOf : [spec.name];
      for (const name of names) {
        if (typeof name === "string") facts.set(name, "Vault slot name");
      }
    }
  }
  return facts;
}

const TOOLS_SOURCE =
  /^packages\/tools\/src\/(?!(?:.*\/)?(?:__tests__|__fixtures__|testing)\/|.*\.test\.[jt]sx?$)/;
const capFactsByLiteral = capFacts();
/** Any Cap id or slot name as a whole token inside a literal (not part of a longer name or host). */
const capFactToken = new RegExp(
  `(?<![\\w.-])(?:${[...capFactsByLiteral.keys()]
    .map((fact) => fact.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))
    .join("|")})(?![\\w.-])`,
  "g"
);

/**
 * The string literals of a source file, with the line each starts on. One pass: line and block
 * comments are skipped, and each literal runs to its own closing quote (escapes honoured), so a
 * quote of another kind inside it, or a template literal over several lines, is read whole.
 * @param {string} source
 * @returns {{ text: string; line: number }[]}
 */
function stringLiterals(source) {
  /** @type {{ text: string; line: number }[]} */
  const out = [];
  let line = 1;
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "\n") {
      line += 1;
      i += 1;
    } else if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
    } else if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (; i < stop; i += 1) if (source[i] === "\n") line += 1;
    } else if (c === '"' || c === "'" || c === "`") {
      const start = line;
      let text = "";
      i += 1;
      while (i < source.length && source[i] !== c) {
        if (source[i] === "\\") {
          text += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (source[i] === "\n") {
          if (c !== "`") break;
          line += 1;
        }
        text += source[i];
        i += 1;
      }
      i += 1;
      out.push({ text, line: start });
    } else {
      i += 1;
    }
  }
  return out;
}

/**
 * @param {string} rel
 * @param {string} source
 * @returns {string[]}
 */
function capFactProblems(rel, source) {
  if (!TOOLS_SOURCE.test(rel)) return [];
  /** @type {string[]} */
  const out = [];
  if (capFactsByLiteral.size === 0) return out;
  for (const { text, line } of stringLiterals(source)) {
    for (const m of text.matchAll(capFactToken)) {
      const fact = m[0];
      const at = line + (text.slice(0, m.index).match(/\n/g)?.length ?? 0);
      out.push(
        `${rel}:${at}: "${fact}" is a ${capFactsByLiteral.get(fact)}; a tool takes it as a parameter from its Cap and never names one`
      );
    }
  }
  return out;
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
  const folder = rel.startsWith(CORE_SRC)
    ? rel.slice(CORE_SRC.length).split("/")
    : [];
  if (folder.length > 1 && folder[0]) coreFolders.add(folder[0]);
}

for (const rel of listed) {
  if (!SOURCE.test(rel)) continue;
  const owner = packages.find((p) => rel.startsWith(`${p.dir}/`));
  if (!owner || !existsSync(path.join(root, rel))) continue;
  scanned += 1;
  const source = readFileSync(path.join(root, rel), "utf-8");
  problems.push(...capFactProblems(rel, source));
  for (const { line, spec } of importsOf(source)) {
    const where = `${rel}:${line}`;
    recordWebEdge(rel, spec, where);

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
      recordCoreEdge(rel, target, where, spec);
      continue;
    }

    if (!spec.startsWith(SCOPE)) continue;
    const [scope = "", pkgName = "", ...rest] = spec.split("/");
    const name = `${scope}/${pkgName}`;
    if (name === owner.name) {
      // A self-import through a public subpath (`@watchdog/core/cases`) is a folder edge too.
      const file =
        owner.exportTargets[`.${rest.length > 0 ? `/${rest.join("/")}` : ""}`];
      if (typeof file === "string") {
        recordCoreEdge(rel, path.posix.join(owner.dir, file), where, spec);
      }
      continue;
    }
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

if (listed.some((f) => f.startsWith(CORE_SRC))) {
  problems.push(...infraImportProblems);
  for (const key of CORE_CYCLE_ALLOWLIST) {
    if (!coreEdges.has(key)) {
      problems.push(
        `${CORE_SRC}: CORE_CYCLE_ALLOWLIST names "${key}", which no import makes any more; delete the entry from scripts/check-boundaries.mjs`
      );
    }
  }
  const counted = [...coreEdges.keys()].filter(
    (key) => !CORE_CYCLE_ALLOWLIST.has(key)
  );
  for (const group of importCycles(counted)) {
    const inside = counted.filter((key) => {
      const [from = "", to = ""] = key.split(" -> ");
      return group.includes(from) && group.includes(to);
    });
    problems.push(
      `${CORE_SRC}: the folders ${group.join(", ")} import each other in a cycle; move the shared code to the folder that owns it. Edges (first import each): ${inside
        .map((key) => `${key} (${coreEdges.get(key)})`)
        .join("; ")}`
    );
  }
}

for (const group of importCycles([...webEdges.keys()])) {
  const inside = [...webEdges.keys()].filter((key) => {
    const [from = "", to = ""] = key.split(" -> ");
    return group.includes(from) && group.includes(to);
  });
  problems.push(
    `${WEB_DOMAINS}: the domains ${group.join(", ")} import each other in a cycle; move the piece both use to the domain that owns it, or to shared/ when it is generic. Edges (first import each): ${inside
      .map((key) => `${key} (${webEdges.get(key)})`)
      .join("; ")}`
  );
}

if (problems.length > 0) {
  for (const p of problems) console.error(`✗ ${p}`);
  console.error(
    "\nPackages import only declared workspace packages, only through their package.json exports; apps are never imported; tools name no Cap id or Vault slot; core folders import no cycle; infra imports no domain folder; web domains import no cycle. See docs/contributing/ci-gates.md."
  );
  process.exit(1);
}
console.log(
  `check:boundaries: ok (${scanned} source files across ${packages.length} workspace packages)`
);
