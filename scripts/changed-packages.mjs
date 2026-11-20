#!/usr/bin/env node
/**
 * Workspace packages affected by a diff, dependents included. `pnpm changed`
 * lists them; `pnpm verify` (scripts/verify.mjs) imports the same selection to
 * pick the tests it runs. It enforces no rule.
 *
 * Diff: merge-base with main (origin/main, then main) against the working tree,
 * plus untracked files. `--base <ref>` replaces the merge-base with another ref.
 * A root-level config change selects every package; a change outside any package
 * (docs, scripts, e2e) selects none.
 *
 * Usage: node scripts/changed-packages.mjs [--base <ref>] [--json]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { changedPaths, git, lines, mergeBaseWith } from "./lib/git-range.mjs";

const root = path.resolve(import.meta.dirname, "..");

/** Root files whose change can alter every package's typecheck or tests. */
const ROOT_CONFIG =
  /^(tsconfig(\.[\w-]+)?\.json|pnpm-workspace\.yaml|package\.json|pnpm-lock\.yaml|vitest[\w.-]*\.(ts|mts|js|mjs)|oxlint\.config\.ts)$/;

/**
 * @param {unknown} v
 * @returns {Record<string, unknown>}
 */
function asRecord(v) {
  return typeof v === "object" && v !== null
    ? Object.fromEntries(Object.entries(v))
    : {};
}

/** @param {string} dir */
export function readPackages(dir) {
  /** @type {{ name: string; dir: string; deps: string[] }[]} */
  const pkgs = [];
  for (const parent of ["apps", "packages"]) {
    const base = path.join(dir, parent);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const file = path.join(base, entry, "package.json");
      if (!existsSync(file)) continue;
      /** @type {unknown} */
      const raw = JSON.parse(readFileSync(file, "utf-8"));
      const json = asRecord(raw);
      const deps = Object.keys({
        ...asRecord(json.dependencies),
        ...asRecord(json.devDependencies),
        ...asRecord(json.peerDependencies),
        ...asRecord(json.optionalDependencies),
      });
      pkgs.push({ name: String(json.name), dir: `${parent}/${entry}`, deps });
    }
  }
  return pkgs;
}

/**
 * @param {{ name: string; dir: string; deps: string[] }[]} pkgs
 * @param {readonly string[]} files repo-relative changed paths
 * @returns {{ name: string; dir: string }[]} affected packages, sorted by dir
 */
export function affected(pkgs, files) {
  const hit = new Set();
  if (files.some((f) => ROOT_CONFIG.test(f))) {
    for (const p of pkgs) hit.add(p.name);
  } else {
    for (const f of files) {
      const owner = pkgs.find((p) => f.startsWith(`${p.dir}/`));
      if (owner) hit.add(owner.name);
    }
  }
  // Close over dependents until stable.
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of pkgs) {
      if (!hit.has(p.name) && p.deps.some((d) => hit.has(d))) {
        hit.add(p.name);
        grew = true;
      }
    }
  }
  return pkgs
    .filter((p) => hit.has(p.name))
    .map(({ name, dir }) => ({ name, dir }))
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

/**
 * The diff base from `--base <ref>`, else the merge base with main.
 * @param {readonly string[]} argv
 * @param {string} dir repo root
 * @returns {string}
 * @throws {Error} when `--base` has no ref, or no merge base with main exists
 */
export function diffBase(argv, dir) {
  const baseIdx = argv.indexOf("--base");
  const given = baseIdx === -1 ? undefined : argv[baseIdx + 1];
  if (baseIdx !== -1 && (given === undefined || given.startsWith("--"))) {
    throw new Error("--base needs a ref, e.g. --base origin/main");
  }
  const base = given ?? mergeBaseWith("main", dir);
  if (!base) {
    throw new Error("no merge base with main; pass --base <ref>");
  }
  return base;
}

/**
 * Paths changed between `base` and the working tree, plus untracked files.
 * @param {string} dir repo root
 * @param {string} base
 * @returns {string[]} repo-relative paths
 */
export function changedFiles(dir, base) {
  return [
    ...new Set([
      ...changedPaths([base], dir),
      ...lines(git(["ls-files", "--others", "--exclude-standard"], dir)),
    ]),
  ];
}

/** @param {string[]} argv */
function main(argv) {
  const picked = affected(
    readPackages(root),
    changedFiles(root, diffBase(argv, root))
  );
  if (argv.includes("--json")) {
    console.log(JSON.stringify(picked, null, 2));
  } else {
    for (const p of picked) console.log(p.name);
  }
  return 0;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(
      `changed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
