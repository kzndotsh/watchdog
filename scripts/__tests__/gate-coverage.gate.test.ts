import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * Meta-test: every gate script wired into a local hook or a CI gates job has
 * a `<script basename>.gate.test.ts` in scripts/__tests__ holding at least one
 * must-fail test. Reads checked-in config as data (lefthook.yml, ci.yml,
 * package.json files); never imports gate code.
 *
 * Gate scripts are the files our own commands run under GATE_DIRS. Third-party
 * tools (THIRD_PARTY) have no script of ours to test and are allow-listed by
 * name. Anything else a gate command resolves to fails this test, so a new gate
 * cannot be wired in without either a test or a deliberate allow-list entry.
 */
const repoRoot = path.resolve(import.meta.dirname, "../..");
const TEST_DIR = path.join(repoRoot, "scripts/__tests__");

const GATE_DIRS = ["scripts/", "packages/db/scripts/"];
const HOOKS = ["pre-commit", "commit-msg", "pre-push"];
const CI_JOBS = ["gates"];
const MUST_FAIL = /fails|must fail|rejects/i;

/**
 * Tools that are not scripts of ours: nothing to fixture-test here.
 * ultracite: pnpm check / fix. tsc: typecheck. astro: typecheck and the site build.
 * vitest: pnpm test:gate. knip: unused code. tsx: the generate:* regen steps (CI
 * checks their drift with git diff). sherif: workspace consistency (mismatched
 * versions, dependency types) inside `pnpm check:workspace`; the catalog rule it cannot
 * express is our scripts/check-catalog.mjs, which has its own gate test.
 */
const THIRD_PARTY = new Set([
  "ultracite",
  "tsc",
  "astro",
  "vitest",
  "knip",
  "tsx",
  "sherif",
]);

/** pnpm subcommands that run no gate. */
const PNPM_NOOP = new Set(["install", "i", "ci", "add", "dlx"]);

interface Pkg {
  readonly dir: string;
  readonly name: string;
  readonly scripts: Record<string, string>;
}

const readPkg = (dir: string): Pkg => {
  const json = JSON.parse(
    readFileSync(path.join(repoRoot, dir, "package.json"), "utf-8")
  ) as { name?: string; scripts?: Record<string, string> };
  return { dir, name: json.name ?? dir, scripts: json.scripts ?? {} };
};

const root = readPkg(".");
const workspace: Pkg[] = [root];
for (const parent of ["apps", "packages"]) {
  for (const entry of readdirSync(path.join(repoRoot, parent))) {
    if (existsSync(path.join(repoRoot, parent, entry, "package.json"))) {
      workspace.push(readPkg(`${parent}/${entry}`));
    }
  }
}

interface Leaves {
  readonly scripts: Set<string>;
  readonly tools: Set<string>;
}

const norm = (p: string) => path.posix.normalize(p.split(path.sep).join("/"));

/** Leading shell glue stripped from a top-level CI/lefthook segment. */
const SHELL_PREFIX = /^(?:then|else|do)\s+/;

/**
 * The pnpm segments of a top-level CI shell / lefthook `run`. Only pnpm
 * invocations are gates; `if [ ... ]; then`, `|| exit 1` and echo strings are
 * shell glue around them.
 */
function topLevelPnpmSegments(command: string): string[] {
  return command
    .replaceAll("\\\n", " ")
    .split(/&&|\n|;|\|\|/)
    .map((s) => s.trim().replace(SHELL_PREFIX, ""))
    .filter((s) => s.startsWith("pnpm "));
}

/** Split a package script (`a && b`) into its commands. */
function scriptSegments(command: string): string[] {
  return command
    .replaceAll("\\\n", " ")
    .split(/&&|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Resolve one command (`pnpm ...`, `node file`, or a tool) into script files and tool names. */
function expandSegment(
  segment: string,
  pkg: Pkg,
  out: Leaves,
  depth: number
): void {
  if (depth > 8) {
    throw new Error(`script recursion too deep at: ${segment}`);
  }
  // Drop leading env assignments (`FOO=bar cmd`).
  const tokens = segment.split(/\s+/);
  while (tokens.length > 0 && /^[A-Z_][A-Z0-9_]*=/.test(tokens[0] ?? "")) {
    tokens.shift();
  }
  const [head, ...args] = tokens;
  if (head === undefined) {
    return;
  }
  if (["node", "bash", "sh"].includes(head)) {
    const file = args.find((t) => !t.startsWith("-"));
    if (file) {
      out.scripts.add(norm(path.posix.join(pkg.dir, file)));
    }
    return;
  }
  if (head !== "pnpm") {
    out.tools.add(head);
    return;
  }

  let filter: string | undefined;
  let recursive = false;
  let i = 0;
  for (; i < args.length && args[i]?.startsWith("-"); i += 1) {
    if (args[i] === "--filter" || args[i] === "-F") {
      i += 1;
      filter = args[i];
    } else if (args[i] === "-r" || args[i] === "--recursive") {
      recursive = true;
    }
  }
  let name = args[i];
  if (name === undefined || PNPM_NOOP.has(name)) {
    return;
  }
  if (name === "exec") {
    expandSegment(args.slice(i + 1).join(" "), pkg, out, depth + 1);
    return;
  }
  if (name === "run") {
    i += 1;
    name = args[i];
  }
  if (name === undefined) {
    return;
  }
  let targets = [pkg];
  if (filter) {
    targets = workspace.filter((p) => p.name === filter);
  } else if (recursive) {
    // `pnpm -r` skips the workspace root unless told otherwise.
    targets = workspace.filter((p) => p !== root);
  }
  if (targets.length === 0) {
    throw new Error(`pnpm --filter ${filter}: no such workspace package`);
  }
  let resolved = false;
  for (const target of targets) {
    const script = target.scripts[name];
    if (script === undefined) {
      continue;
    }
    resolved = true;
    for (const inner of scriptSegments(script)) {
      expandSegment(inner, target, out, depth + 1);
    }
  }
  if (!resolved) {
    throw new Error(`pnpm ${name}: no such script in ${pkg.dir}`);
  }
}

interface Surface {
  readonly where: string;
  readonly command: string;
  readonly pkg: Pkg;
}

function surfaces(): Surface[] {
  const found: Surface[] = [];
  const lefthook = parse(
    readFileSync(path.join(repoRoot, "lefthook.yml"), "utf-8")
  ) as Record<
    string,
    { commands?: Record<string, { run: string; root?: string }> }
  >;
  for (const hook of HOOKS) {
    for (const [name, spec] of Object.entries(lefthook[hook]?.commands ?? {})) {
      const dir = spec.root ? norm(spec.root).replace(/\/$/, "") : ".";
      found.push({
        where: `lefthook ${hook}/${name}`,
        command: spec.run,
        pkg: workspace.find((p) => p.dir === dir) ?? root,
      });
    }
  }
  const ci = parse(
    readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf-8")
  ) as { jobs: Record<string, { steps?: { name?: string; run?: string }[] }> };
  for (const job of CI_JOBS) {
    for (const step of ci.jobs[job]?.steps ?? []) {
      if (step.run) {
        found.push({
          where: `ci ${job}/${step.name ?? step.run}`,
          command: step.run,
          pkg: root,
        });
      }
    }
  }
  return found;
}

// script -> where it is wired
const gateScripts = new Map<string, string[]>();
const unclassified: string[] = [];
for (const surface of surfaces()) {
  const leaves: Leaves = { scripts: new Set(), tools: new Set() };
  for (const segment of topLevelPnpmSegments(surface.command)) {
    expandSegment(segment, surface.pkg, leaves, 0);
  }
  for (const script of leaves.scripts) {
    if (GATE_DIRS.some((dir) => script.startsWith(dir))) {
      gateScripts.set(script, [
        ...(gateScripts.get(script) ?? []),
        surface.where,
      ]);
    }
  }
  for (const tool of leaves.tools) {
    if (!THIRD_PARTY.has(tool)) {
      unclassified.push(`${surface.where}: ${tool}`);
    }
  }
}

const TEST_TITLE = /\b(?:it|test)\s*\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;

function testTitles(file: string): string[] {
  const text = readFileSync(file, "utf-8");
  return [...text.matchAll(TEST_TITLE)].map((m) => m[2] ?? "");
}

describe("gate coverage (meta)", () => {
  it("discovers the gate scripts wired into hooks and CI", () => {
    expect(gateScripts.size).toBeGreaterThanOrEqual(8);
    expect([...gateScripts.keys()]).toContain(
      "scripts/check-docs-affected.mjs"
    );
  });

  it("fails on any hook or CI command that is neither one of our scripts nor an allow-listed tool", () => {
    expect(unclassified).toEqual([]);
  });

  it.each([...gateScripts.entries()])(
    "%s has a gate test with a must-fail case",
    (script, wiredAt) => {
      const base = path.basename(script).replace(/\.[^.]+$/, "");
      const testFile = path.join(TEST_DIR, `${base}.gate.test.ts`);
      expect(
        existsSync(testFile),
        `${script} (wired at ${wiredAt.join(", ")}) needs scripts/__tests__/${base}.gate.test.ts`
      ).toBe(true);
      const titles = testTitles(testFile);
      expect(
        titles.some((t) => MUST_FAIL.test(t)),
        `${base}.gate.test.ts needs a test whose name matches ${MUST_FAIL} (a must-fail fixture)`
      ).toBe(true);
    }
  );
});
