#!/usr/bin/env node
/**
 * Runs the official DESIGN.md linter (`@google/design.md`, the `designmd` bin) over
 * DESIGN.md and fails on any error or warning. The CLI exits 1 on errors only, so this
 * reads its JSON summary: errors + warnings > 0 fails, infos are fine.
 *
 *   node scripts/lint-design.mjs [file]   (default: DESIGN.md)
 */
import { spawnSync } from "node:child_process";

const file = process.argv[2] ?? "DESIGN.md";
const res = spawnSync(
  "node_modules/.bin/designmd",
  ["lint", file, "--format", "json"],
  {
    encoding: "utf-8",
  }
);

/**
 * @typedef {{ severity: string, path?: string, rule?: string, message: string }} Finding
 * @typedef {{ findings: Finding[], summary: { errors: number, warnings: number, infos: number } }} Report
 */

/**
 * @param {unknown} value
 * @returns {value is Report}
 */
const isReport = (value) =>
  typeof value === "object" &&
  value !== null &&
  "findings" in value &&
  "summary" in value;

/** @type {unknown} */
let parsed;
try {
  parsed = JSON.parse(res.stdout);
} catch {
  parsed = undefined;
}

if (!isReport(parsed)) {
  console.error(`lint:design: designmd produced no JSON report for ${file}`);
  if (res.error) console.error(String(res.error));
  if (res.stderr) console.error(res.stderr);
  process.exit(1);
}

const report = parsed;
const { errors, warnings, infos } = report.summary;
for (const f of report.findings) {
  if (f.severity === "info") continue;
  console.error(
    `  ${f.severity} ${f.rule ?? ""} ${f.path ?? ""}: ${f.message}`.replaceAll(
      /\s+/g,
      " "
    )
  );
}
if (errors + warnings > 0) {
  console.error(
    `lint:design: ${file} has ${errors} error(s) and ${warnings} warning(s) (${infos} info)`
  );
  process.exit(1);
}
console.log(`lint:design: ok (${infos} info)`);
