#!/usr/bin/env node
/**
 * Repo-meta gate: `.github/CODEOWNERS` must stay truthful.
 *
 * Fails when the file is missing, a rule line has no owner, an owner is not
 * `@user`, `@org/team` or an email, or a pattern matches no tracked file
 * (`git ls-files`). A dead pattern means a renamed or deleted path is silently
 * unowned. Patterns follow gitignore rules as GitHub applies them: a leading
 * `/` or an inner `/` anchors to the repo root, otherwise the pattern matches at
 * any depth; a trailing `/` (or a plain path) owns everything beneath; `*`
 * stays inside one path segment, `**` crosses segments.
 *
 *   node scripts/check-codeowners.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const FILE = ".github/CODEOWNERS";

const OWNER =
  /^(?:@[A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9._-]+)?|[^\s@]+@[^\s@]+\.[^\s@]+)$/;

/** @param {string} text */
function escapeRegex(text) {
  return text.replaceAll(/[.+^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {string} pattern
 * @returns {RegExp}
 */
function patternToRegex(pattern) {
  const anchored =
    pattern.startsWith("/") || pattern.slice(0, -1).includes("/");
  const body = pattern.replace(/^\//, "").replace(/\/$/, "");
  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    const rest = body.slice(i);
    if (rest.startsWith("**/")) {
      out += "(?:.*/)?";
      i += 2;
    } else if (rest.startsWith("/**")) {
      out += "/.*";
      i += 2;
    } else if (rest.startsWith("**")) {
      out += ".*";
      i += 1;
    } else if (body[i] === "*") {
      out += "[^/]*";
    } else if (body[i] === "?") {
      out += "[^/]";
    } else {
      out += escapeRegex(body[i] ?? "");
    }
  }
  return new RegExp(`^${anchored ? "" : "(?:.*/)?"}${out}(?:/.*)?$`);
}

/** @param {string[]} problems */
function fail(problems) {
  for (const p of problems) console.error(`✗ ${p}`);
  console.error(
    `\nFix ${FILE}: every rule needs a pattern that matches a tracked file and at least one owner (@user, @org/team or email). See docs/contributing/ci-gates.md.`
  );
  process.exit(1);
}

const abs = path.join(root, FILE);
if (!existsSync(abs)) fail([`${FILE} is missing`]);

const ls = spawnSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf-8",
  maxBuffer: 64 * 1024 * 1024,
});
if (ls.status !== 0) {
  console.error(`git ls-files failed: ${ls.stderr}`);
  process.exit(1);
}
const tracked = ls.stdout.split("\0").filter(Boolean);

/** @type {string[]} */
const problems = [];
let rules = 0;

for (const [i, raw] of readFileSync(abs, "utf-8").split("\n").entries()) {
  const line = raw.replace(/(^|\s)#.*$/, "").trim();
  if (!line) continue;
  rules += 1;
  const where = `${FILE}:${i + 1}`;
  const [pattern = "", ...owners] = line.split(/\s+/);
  if (owners.length === 0) {
    problems.push(`${where}: ${pattern} has no owner`);
    continue;
  }
  for (const owner of owners) {
    if (!OWNER.test(owner)) {
      problems.push(
        `${where}: ${pattern}: invalid owner "${owner}" (use @user, @org/team or an email)`
      );
    }
  }
  const re = patternToRegex(pattern);
  if (!tracked.some((f) => re.test(f))) {
    problems.push(`${where}: ${pattern} matches no tracked file`);
  }
}

if (problems.length > 0) fail(problems);
console.log(`check:codeowners: ok (${rules} rule(s))`);
