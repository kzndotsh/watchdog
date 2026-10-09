#!/usr/bin/env node
/**
 * Writes or shrinks a plugin rule's baseline (scripts/oxlint-plugin/baselines/<rule>.json).
 *
 *   node scripts/oxlint-baseline.mjs <rule-id> --init   first baseline: current counts
 *   node scripts/oxlint-baseline.mjs <rule-id>          shrink: lower counts, drop gone entries
 *
 * Counts come from a real oxlint run with the baseline wrapper off, so they are what
 * the rule finds, not what the old baseline allowed. Shrinking never raises an entry and
 * refuses a violation that is not baselined: new violations are fixed, not recorded.
 * `--config <path>` lints with another oxlint config (fixture repos in the gate tests).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { isRecord } from "./oxlint-plugin/lib/ast.mjs";
import {
  BASELINE_OFF_ENV,
  REPO_ROOT,
  baselinePath,
  readBaseline,
} from "./oxlint-plugin/lib/baseline.mjs";

const args = process.argv.slice(2);
const init = args.includes("--init");
const configAt = args.indexOf("--config");
const config =
  configAt === -1 ? "oxlint.config.ts" : (args[configAt + 1] ?? "");
const ruleId = args.find(
  (arg, i) => !arg.startsWith("--") && i !== configAt + 1
);

if (!ruleId || !config) {
  console.error(
    "usage: node scripts/oxlint-baseline.mjs <rule-id> [--init] [--config <path>]"
  );
  process.exit(2);
}

const res = spawnSync(
  path.join(REPO_ROOT, "node_modules/.bin/oxlint"),
  ["-c", config, "--format", "json", "."],
  {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    env: { ...process.env, [BASELINE_OFF_ENV]: "1" },
    maxBuffer: 256 * 1024 * 1024,
  }
);

/** @type {unknown} */
let report = null;
try {
  report = JSON.parse(res.stdout);
} catch {
  console.error(`oxlint-baseline: no JSON report from oxlint\n${res.stderr}`);
  process.exit(2);
}
const diagnostics =
  isRecord(report) && Array.isArray(report.diagnostics)
    ? report.diagnostics
    : [];

/** @type {Map<string, number>} */
const current = new Map();
for (const d of diagnostics) {
  if (
    !isRecord(d) ||
    d.code !== `watchdog(${ruleId})` ||
    typeof d.filename !== "string"
  ) {
    continue;
  }
  current.set(d.filename, (current.get(d.filename) ?? 0) + 1);
}

const target = baselinePath(ruleId);
const existing = readBaseline(ruleId);
/** @type {Map<string, number>} */
const next = new Map();
/** @type {string[]} */
const failures = [];

if (init) {
  if (existing.size > 0) {
    console.error(
      `✗ ${ruleId}: baseline already exists; run without --init to shrink it`
    );
    process.exit(1);
  }
  for (const [file, count] of current) next.set(file, count);
} else {
  for (const [file, count] of current) {
    const allowed = existing.get(file);
    if (allowed === undefined || count > allowed) {
      failures.push(
        `${file}: ${count} ${ruleId} violation(s), baseline allows ${allowed ?? 0}; fix them`
      );
    } else {
      next.set(file, count);
    }
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(`✗ ${f}`);
  process.exit(1);
}

if (next.size === 0) {
  if (existsSync(target)) unlinkSync(target);
  console.log(`oxlint-baseline: ${ruleId} is clean, baseline removed`);
} else {
  /** @type {Record<string, number>} */
  const sorted = {};
  for (const file of [...next.keys()].sort((a, b) => a.localeCompare(b))) {
    sorted[file] = next.get(file) ?? 0;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(
    `oxlint-baseline: ${ruleId} baseline written (${next.size} file(s))`
  );
}
