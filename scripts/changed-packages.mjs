#!/usr/bin/env node
/**
 * Workspace packages affected by a diff, dependents included. Advisory, local
 * speed-up: `pnpm changed` lists them, `pnpm changed --run` typechecks and
 * unit-tests only those. It enforces no rule; `pnpm typecheck` / `pnpm test`
 * stay the full gates.
 *
 * Diff: merge-base with main (origin/main, then main) against the working tree,
 * plus untracked files. `--base <ref>` replaces the merge-base with another ref.
 * A root-level config change selects every package; a change outside any package
 * (docs, scripts, e2e) selects none.
 *
 * Usage: node scripts/changed-packages.mjs [--base <ref>] [--json] [--run]
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

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
function readPackages(dir) {
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

/** @param {string[]} argv */
function main(argv) {
  const baseIdx = argv.indexOf("--base");
  const base = baseIdx === -1 ? mergeBaseWith("main", root) : argv[baseIdx + 1];
  if (!base) {
    throw new Error("no merge base with main; pass --base <ref>");
  }
  const files = [
    ...new Set([
      ...changedPaths([base], root),
      ...lines(git(["ls-files", "--others", "--exclude-standard"], root)),
    ]),
  ];
  const picked = affected(readPackages(root), files);

  if (argv.includes("--json")) {
    console.log(JSON.stringify(picked, null, 2));
  } else {
    for (const p of picked) console.log(p.name);
  }
  if (!argv.includes("--run") || picked.length === 0) return 0;

  const steps = [
    [
      "pnpm",
      ...picked.flatMap((p) => ["--filter", p.name]),
      "run",
      "--if-present",
      "typecheck",
    ],
    [
      "pnpm",
      "exec",
      "vitest",
      "run",
      "--project",
      "unit",
      "--project",
      "web-unit",
      "--project",
      "property",
      ...picked.map((p) => p.dir),
    ],
  ];
  for (const [cmd, ...args] of steps) {
    const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
    if (res.status !== 0) return res.status ?? 1;
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(
      `changed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
