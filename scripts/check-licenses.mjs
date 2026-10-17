#!/usr/bin/env node
/**
 * License gate: every production dependency's license must be on the allowlist
 * below, or the package must have a reviewed entry in `license-exceptions.json`
 * (which records what the review found and why).
 *
 * The product is AGPL-3.0-only, so the allowlist is permissive licenses, weak
 * copyleft (MPL-2.0, LGPL) and licenses compatible with AGPL-3.0. Strong
 * copyleft that cannot combine with AGPL, proprietary text, and "Unknown" fail.
 * An SPDX `A OR B` passes when either side does; `A AND B` needs both.
 *
 *   node scripts/check-licenses.mjs [--input <pnpm-licenses.json>]
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { asRecord, loadProdLicenses } from "./lib/prod-licenses.mjs";

const ALLOWED = new Set([
  "MIT",
  "MIT-0",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
  "BlueOak-1.0.0",
  "Zlib",
  "MPL-2.0",
  "AGPL-3.0-only",
  "AGPL-3.0-or-later",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
]);
const ALLOWED_PREFIXES = ["LGPL-"];

/** @param {string} id */
const idAllowed = (id) =>
  ALLOWED.has(id) || ALLOWED_PREFIXES.some((p) => id.startsWith(p));

/** @param {string} expr */
function expressionAllowed(expr) {
  const orParts = expr
    .replaceAll(/[()]/g, " ")
    .split(/\s+OR\s+/)
    .map((part) => part.trim());
  return orParts.some((part) =>
    part.split(/\s+AND\s+/).every((id) => idAllowed(id.trim()))
  );
}

const root = path.resolve(import.meta.dirname, "..");
const exceptions = asRecord(
  JSON.parse(
    readFileSync(path.join(root, "scripts/license-exceptions.json"), "utf-8")
  )
);

const failures = [];
const used = new Set();
for (const pkg of loadProdLicenses(process.argv.slice(2))) {
  if (expressionAllowed(pkg.license)) {
    continue;
  }
  if (asRecord(exceptions[pkg.name]).reported === pkg.license) {
    used.add(pkg.name);
    continue;
  }
  failures.push(`${pkg.name}@${pkg.version}: ${pkg.license}`);
}

if (failures.length > 0) {
  console.error(
    `check:licenses: ${failures.length} production dependenc${failures.length === 1 ? "y has" : "ies have"} a license outside the allowlist:`
  );
  for (const line of failures) {
    console.error(`  ${line}`);
  }
  console.error(
    "Review the license, then add the package to scripts/license-exceptions.json with the finding (docs/contributing/ci-gates.md#license-gate), or drop the dependency."
  );
  process.exit(1);
}
console.log(`check:licenses: ok (${used.size} reviewed exceptions in use)`);
