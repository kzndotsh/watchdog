#!/usr/bin/env node
/**
 * One command to know a change is done.
 *
 *   pnpm verify         lint and format on the changed files, every static gate,
 *                       `pnpm typecheck`, and the unit and property tests of the
 *                       packages the diff affects (dependents included), plus the
 *                       gate tests when gate scripts or hook/CI config changed and
 *                       the e2e parser tests when `e2e/` changed. The agent stop
 *                       hook runs this form.
 *   pnpm verify --full  what the CI `gates` job runs: `pnpm check` over the repo,
 *                       every static gate plus licenses, notices and knip, the
 *                       generated-file drift checks, `pnpm typecheck` and `pnpm test`.
 *
 * Component, integration, scale and e2e tests, the web and site builds and the
 * container stay in their own CI jobs (they need a browser, Postgres, S3 or minutes).
 *
 * The diff is the merge base with main (or `--base <ref>`) against the working
 * tree, plus untracked files: the same selection as `pnpm changed`. Every step
 * runs even after one fails, so one run reports every failure; the exit code is
 * 1 when any step failed. `--dry-run` prints the plan and runs nothing.
 *
 * Usage: node scripts/verify.mjs [--full] [--base <ref>] [--dry-run]
 */
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  affected,
  changedFiles,
  diffBase,
  readPackages,
} from "./changed-packages.mjs";
import { mergeBaseWith } from "./lib/git-range.mjs";

const root = path.resolve(import.meta.dirname, "..");

/** Static gates: whole-repo, a few seconds each, run in parallel in both modes. */
const STATIC_GATES = [
  "check:agents:strict",
  "check:docs:strict",
  "check:tagged-errors:strict",
  "check:workspace-reexports",
  "check:vendor",
  "check:size",
  "check:action-pins",
  "check:workspace",
  "check:boundaries",
  "check:migrations",
  "check:env",
  "lint:design",
];

/** Gates that only `--full` adds: they read every production dependency or the whole graph. */
const FULL_ONLY_GATES = ["check:licenses", "check:notices", "knip"];

/** Generators whose committed output must not change when rerun (`--full`). */
const DRIFT = [
  {
    script: "generate:caps",
    files: [
      "packages/caps/capabilities.gen.json",
      "docs/reference/platform/cap-register.md",
    ],
  },
  { script: "generate-routes", files: ["apps/web/src/routeTree.gen.ts"] },
  { script: "generate:design", files: ["DESIGN.md"] },
];

/** Files Oxlint or Oxfmt read; the formatter's own ignore list drops the rest. */
const LINTABLE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|ya?ml|md)$/;

/** A change here can break a gate test (they read scripts, hooks and CI config as data). */
const GATE_TEST_INPUT =
  /^(scripts\/|packages\/server\/db\/scripts\/|\.cursor\/hooks\/|\.github\/workflows\/|lefthook\.yml$|vitest\.config\.ts$)/;

const ZERO_SHA = /^0+$/;

/**
 * @typedef {{ name: string; cmd: string[]; env?: Record<string, string>; drift?: string[] }} Step
 * @typedef {{ before: Step[]; gates: Step[]; after: Step[] }} Plan
 *   `before` and `after` run one at a time; `gates` run in parallel between them.
 * @typedef {{ step: Step; ok: boolean; output: string; ms: number }} Result
 */

/**
 * @param {string} script
 * @param {...string} args
 */
const pnpmRun = (script, ...args) => [
  "pnpm",
  "run",
  "--silent",
  script,
  ...args,
];

/** @param {string} script @returns {Step} */
const gate = (script) => ({
  name: script,
  cmd: pnpmRun(script),
  // knip loads the Drizzle config, which needs a DATABASE_URL (any value).
  ...(script === "knip"
    ? { env: { DATABASE_URL: process.env.DATABASE_URL ?? "postgres://verify" } }
    : {}),
});

/**
 * Skills staleness diffs against the base; without one it reads the working tree.
 * @param {string | null} base
 * @returns {Step}
 */
const validateAgents = (base) => ({
  name: "validate:agents",
  cmd: base
    ? pnpmRun("validate:agents", `--range=${base}`)
    : pnpmRun("validate:agents"),
});

/**
 * @param {string[]} files changed paths
 * @param {string} base
 * @returns {Plan}
 */
export function changedPlan(files, base) {
  const lintable = files.filter(
    (f) => LINTABLE.test(f) && existsSync(path.join(root, f))
  );
  const projects = ["unit", "web-unit", "property"];
  const filters = affected(readPackages(root), files).map((p) => p.dir);
  if (files.some((f) => GATE_TEST_INPUT.test(f))) {
    projects.push("gate");
    filters.push("scripts/__tests__/");
  }
  if (files.some((f) => f.startsWith("e2e/"))) {
    projects.push("e2e-parser");
    filters.push("e2e/");
  }
  return {
    before:
      lintable.length > 0
        ? [
            {
              name: "lint + format (changed files)",
              cmd: [
                "pnpm",
                "exec",
                "ultracite",
                "check",
                "--disable-nested-config",
                "--no-error-on-unmatched-pattern",
                ...lintable,
              ],
            },
          ]
        : [],
    gates: [...STATIC_GATES.map(gate), validateAgents(base)],
    after: [
      { name: "typecheck", cmd: pnpmRun("typecheck") },
      ...(filters.length > 0
        ? [
            {
              name: "tests (affected)",
              cmd: [
                "pnpm",
                "exec",
                "vitest",
                "run",
                "--passWithNoTests",
                ...projects.flatMap((p) => ["--project", p]),
                ...filters,
              ],
            },
          ]
        : []),
    ],
  };
}

/**
 * @param {string | null} base
 * @returns {Plan}
 */
export function fullPlan(base) {
  return {
    before: [{ name: "lint + format", cmd: pnpmRun("check") }],
    gates: [
      ...[...STATIC_GATES, ...FULL_ONLY_GATES].map(gate),
      validateAgents(base),
    ],
    after: [
      ...DRIFT.map(({ script, files }) => ({
        name: `${script} drift`,
        cmd: pnpmRun(script),
        drift: files,
      })),
      { name: "typecheck", cmd: pnpmRun("typecheck") },
      { name: "test", cmd: pnpmRun("test") },
    ],
  };
}

/** @param {string} file */
const readOrNull = (file) => {
  const abs = path.join(root, file);
  return existsSync(abs) ? readFileSync(abs, "utf-8") : null;
};

/**
 * A drift step fails when its generator changed a committed file.
 * @param {Step} step
 * @param {(string | null)[] | undefined} before contents before the step ran
 * @param {Omit<Result, "step" | "ms">} res
 */
function checkDrift(step, before, res) {
  if (!res.ok || !step.drift || !before) return res;
  const drifted = step.drift.filter((f, i) => readOrNull(f) !== before[i]);
  if (drifted.length === 0) return res;
  return {
    ok: false,
    output: `${res.output}\nGenerated output changed: ${drifted.join(", ")}. The step regenerated it: review and commit it.`,
  };
}

/** @param {Step} step @returns {Result} */
function runSync(step) {
  console.log(`.. ${step.name}`);
  const before = step.drift?.map(readOrNull);
  const started = Date.now();
  const [cmd = "", ...args] = step.cmd;
  const res = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf-8",
    env: { ...process.env, ...step.env },
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = [res.stdout, res.stderr, res.error?.message]
    .filter(Boolean)
    .join("\n");
  return {
    step,
    ...checkDrift(step, before, { ok: res.status === 0, output }),
    ms: Date.now() - started,
  };
}

/** @param {Step} step @returns {Promise<Result>} */
async function runAsync(step) {
  const started = Date.now();
  const [cmd = "", ...args] = step.cmd;
  const child = spawn(cmd, args, {
    cwd: root,
    env: { ...process.env, ...step.env },
  });
  let output = "";
  child.stdout.on("data", (d) => {
    output += String(d);
  });
  child.stderr.on("data", (d) => {
    output += String(d);
  });
  let ok = false;
  try {
    /** @type {unknown[]} */
    const closed = await once(child, "close");
    ok = closed[0] === 0;
  } catch (error) {
    output += error instanceof Error ? error.message : String(error);
  }
  return { step, ok, output, ms: Date.now() - started };
}

/** @param {Result} r */
function report(r) {
  const secs = (r.ms / 1000).toFixed(1);
  console.log(`${r.ok ? "ok  " : "FAIL"} ${r.step.name} (${secs}s)`);
  if (!r.ok) {
    console.log(`${r.output.trim()}\n`);
  }
  return r;
}

/** @param {Plan} plan */
async function execute(plan) {
  const results = plan.before.map((s) => report(runSync(s)));
  console.log(`.. ${plan.gates.length} static gates in parallel`);
  const gates = await Promise.all(plan.gates.map(runAsync));
  results.push(
    ...gates.map(report),
    ...plan.after.map((s) => report(runSync(s)))
  );

  const failed = results.filter((r) => !r.ok).map((r) => r.step.name);
  if (failed.length > 0) {
    console.log(`verify: ${failed.length} failed: ${failed.join(", ")}`);
    return 1;
  }
  console.log(`verify: ${results.length} steps passed`);
  return 0;
}

/** @param {string[]} argv */
async function main(argv) {
  const full = argv.includes("--full");
  const baseIdx = argv.indexOf("--base");
  const givenBase = baseIdx === -1 ? undefined : argv[baseIdx + 1];
  // CI passes the push's `before` SHA, which is all zeros for a new branch.
  const args =
    givenBase !== undefined && ZERO_SHA.test(givenBase)
      ? argv.filter((_, i) => i !== baseIdx && i !== baseIdx + 1)
      : argv;

  /** @type {Plan} */
  let plan;
  if (full) {
    // No main to diff against (a fresh clone of a fork) only drops the
    // skills staleness warning; every gate still runs.
    const base = args.includes("--base")
      ? diffBase(args, root)
      : mergeBaseWith("main", root);
    plan = fullPlan(base);
  } else {
    const base = diffBase(args, root);
    plan = changedPlan(changedFiles(root, base), base);
  }

  if (argv.includes("--dry-run")) {
    for (const s of [...plan.before, ...plan.gates, ...plan.after]) {
      console.log(`${s.name}: ${s.cmd.join(" ")}`);
    }
    return 0;
  }
  return execute(plan);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exit(await main(process.argv.slice(2)));
  } catch (error) {
    console.error(
      `verify: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }
}
