#!/usr/bin/env node
/**
 * Supply-chain gate: every third-party GitHub Action in `.github/workflows/*.{yml,yaml}`
 * must be pinned by full 40-char commit SHA with the version tag in a trailing comment:
 *
 *   uses: actions/checkout@<40-hex-sha> # v7
 *
 * Tags and branches are mutable; a SHA is not. Local (`./`) actions and `docker://`
 * references are out of scope. Dependabot understands this format and bumps the SHA and
 * the comment together.
 *
 *   node scripts/check-action-pins.mjs
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const workflowsDir = path.join(root, ".github/workflows");

const USES = /^\s*(?:-\s+)?uses:\s*(?<value>.*?)\s*$/;
const PINNED = /^[^@\s]+@[0-9a-f]{40}$/;

/**
 * @param {string} line
 * @returns {{ ref: string; comment: string } | null}
 */
function parseUses(line) {
  const match = USES.exec(line);
  if (!match?.groups) return null;
  const rest = match.groups.value;
  const hash = rest.indexOf(" #");
  const raw = hash === -1 ? rest : rest.slice(0, hash);
  const comment = hash === -1 ? "" : rest.slice(hash + 2).trim();
  return { ref: raw.trim().replace(/^(["'])(.*)\1$/, "$2"), comment };
}

/** @type {string[]} */
const problems = [];
let checked = 0;

const files = existsSync(workflowsDir)
  ? readdirSync(workflowsDir)
      .filter((f) => /\.ya?ml$/.test(f))
      .sort()
  : [];

for (const file of files) {
  const rel = `.github/workflows/${file}`;
  const lines = readFileSync(path.join(workflowsDir, file), "utf-8").split(
    "\n"
  );
  for (const [i, line] of lines.entries()) {
    const uses = parseUses(line);
    if (!uses) continue;
    if (uses.ref.startsWith("./") || uses.ref.startsWith("docker://")) continue;
    checked += 1;
    const where = `${rel}:${i + 1}`;
    if (PINNED.test(uses.ref)) {
      if (!uses.comment) {
        problems.push(
          `${where}: ${uses.ref} needs a trailing version comment (# v1.2.3)`
        );
      }
    } else {
      problems.push(
        `${where}: ${uses.ref} is not pinned to a full 40-char commit SHA`
      );
    }
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`✗ ${p}`);
  console.error(
    "\nPin third-party actions as `uses: owner/repo@<40-char sha> # vX.Y.Z` (resolve with `gh api repos/<owner>/<repo>/git/ref/tags/<tag>`; dereference annotated tags to the commit). See docs/contributing/ci-gates.md."
  );
  process.exit(1);
}
console.log(
  `check:action-pins: ok (${checked} third-party action reference(s) in ${files.length} workflow(s))`
);
