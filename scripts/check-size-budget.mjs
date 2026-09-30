#!/usr/bin/env node
/**
 * File-size ratchet: tracked source files stay at or under MAX_LINES.
 * Files already over budget are listed in size-budget-baseline.json and may
 * shrink but never grow. `--update` rewrites the baseline from disk (entries
 * only drop or decrease; a file that grew past its baseline still fails).
 *
 * Why: long files are where agents and reviewers lose the thread. A ratchet
 * lets the rule land without a cleanup sprint.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const MAX_LINES = 600;
const root = path.resolve(import.meta.dirname, "..");
const baselinePath = path.join(root, "scripts/size-budget-baseline.json");
const update = process.argv.includes("--update");

const EXCLUDE = [
  /routeTree\.gen\.ts$/,
  /\/generated\//,
  /\.gen\./,
  /\/shadcn\//,
  /\/__tests__\//,
  /\.test\.tsx?$/,
];

function trackedSources() {
  const out = execFileSync(
    "git",
    [
      "ls-files",
      "apps/*/src/**/*.ts",
      "apps/*/src/**/*.tsx",
      "packages/*/src/**/*.ts",
      "packages/*/src/**/*.tsx",
    ],
    { cwd: root, encoding: "utf-8" }
  );
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !EXCLUDE.some((re) => re.test(f)));
}

/** @param {string} rel */
function lineCount(rel) {
  try {
    return readFileSync(path.join(root, rel), "utf-8").split("\n").length;
  } catch {
    return 0;
  }
}

/** @returns {Map<string, number>} */
function readBaseline() {
  /** @type {Map<string, number>} */
  const out = new Map();
  /** @type {unknown} */
  let parsed = null;
  try {
    parsed = JSON.parse(readFileSync(baselinePath, "utf-8"));
  } catch {
    // Missing or unreadable baseline = empty.
    return out;
  }
  if (parsed === null || typeof parsed !== "object") return out;
  for (const [file, lines] of Object.entries(parsed)) {
    if (typeof lines === "number") out.set(file, lines);
  }
  return out;
}

const baseline = readBaseline();
/** @type {string[]} */
const failures = [];
/** @type {Map<string, number>} */
const next = new Map();

for (const rel of trackedSources()) {
  const lines = lineCount(rel);
  if (lines <= MAX_LINES) continue;
  const allowed = baseline.get(rel);
  if (allowed === undefined) {
    failures.push(`${rel}: ${lines} lines (budget ${MAX_LINES}) — split it`);
    continue;
  }
  if (lines > allowed) {
    failures.push(
      `${rel}: ${lines} lines, baseline ${allowed} — over-budget files may only shrink`
    );
  }
  next.set(rel, Math.min(lines, allowed));
}

if (update) {
  const files = [...next.keys()].sort((a, b) => a.localeCompare(b));
  /** @type {Record<string, number>} */
  const sorted = {};
  for (const file of files) sorted[file] = next.get(file) ?? 0;
  writeFileSync(baselinePath, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`check:size: baseline written (${files.length} file(s))`);
}

if (failures.length > 0) {
  for (const f of failures) console.error(`✗ ${f}`);
  process.exit(1);
}
console.log(
  `check:size: ok (${next.size} baselined file(s) over ${MAX_LINES})`
);
