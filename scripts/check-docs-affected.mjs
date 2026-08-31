#!/usr/bin/env node
/**
 * Warn (default) or fail (--strict / --strict-only) when code changes lack a
 * paired doc touch per scripts/doc-map.mjs.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { hasAllowAffect, matchRules } from "./doc-map.mjs";

const root = path.resolve(import.meta.dirname, "..");
const strict =
  process.argv.includes("--strict") || process.env.CHECK_DOCS_STRICT === "1";
const strictOnly = process.argv.includes("--strict-only");

/**
 * @param {string[]} args
 * @returns {string}
 */
function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf-8" });
  } catch {
    return "";
  }
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function fileAllows(filePath) {
  if (!(filePath && existsSync(filePath))) return false;
  try {
    return hasAllowAffect(readFileSync(filePath, "utf-8"));
  } catch {
    return false;
  }
}

function changedFiles() {
  if (process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true") {
    const baseRef = process.env.GITHUB_BASE_REF
      ? `origin/${process.env.GITHUB_BASE_REF}`
      : (process.env.DOCS_AFFECT_BASE ?? "origin/main");
    const mergeBase = git(["merge-base", baseRef, "HEAD"]).trim();
    if (mergeBase) {
      return [
        ...new Set(
          git(["diff", "--name-only", `${mergeBase}...HEAD`])
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
        ),
      ];
    }
  }

  const staged = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  const unstaged = git(["diff", "--name-only", "--diff-filter=ACMR"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return [
    ...new Set(
      [...staged.split("\n"), ...unstaged.split("\n"), ...untracked.split("\n")]
        .map((l) => l.trim())
        .filter(Boolean)
    ),
  ];
}

function allow() {
  if (process.env.DOCS_ALLOW_AFFECT === "1") return true;

  const msgPath = process.env.DOCS_ALLOW_AFFECT_MSG;
  if (fileAllows(msgPath ?? "")) return true;

  // In-flight commit message (available during pre-commit for `git commit -m`).
  if (fileAllows(path.join(root, ".git", "COMMIT_EDITMSG"))) return true;

  // Stamp written by commit-msg hook (amend / later hooks).
  const stamp = path.join(root, ".git", "docs-allow-affect");
  if (existsSync(stamp)) {
    try {
      const stamped = readFileSync(stamp, "utf-8").trim();
      if (stamped && fileAllows(stamped)) return true;
      if (stamped && hasAllowAffect(stamped)) return true;
    } catch {
      // ignore
    }
  }

  // PR body fallback (CI).
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && existsSync(eventPath)) {
    try {
      /** @type {unknown} */
      const event = JSON.parse(readFileSync(eventPath, "utf-8"));
      const body =
        event &&
        typeof event === "object" &&
        "pull_request" in event &&
        event.pull_request &&
        typeof event.pull_request === "object" &&
        "body" in event.pull_request &&
        typeof event.pull_request.body === "string"
          ? event.pull_request.body
          : "";
      if (hasAllowAffect(body)) return true;
    } catch {
      // ignore
    }
  }

  const last = git(["log", "-1", "--format=%B"]);
  return Boolean(last && hasAllowAffect(last));
}

/**
 * @param {string} docPattern
 * @param {string[]} changed
 */
function docTouched(docPattern, changed) {
  if (docPattern.endsWith("/")) {
    return changed.some(
      (f) => f.startsWith(docPattern) || f === docPattern.slice(0, -1)
    );
  }
  return changed.includes(docPattern);
}

function main() {
  if (allow()) {
    console.log("check:docs-affected: allow-affect present — skip");
    process.exit(0);
  }

  const changed = changedFiles();
  if (changed.length === 0) {
    console.log("check:docs-affected: no changes");
    process.exit(0);
  }

  const hits = matchRules(changed);
  /** @type {string[]} */
  const missing = [];

  for (const { rule, matchedCode } of hits) {
    if (strictOnly && !rule.strict) continue;
    const existingDocs = rule.docs.filter((d) =>
      existsSync(path.join(root, d))
    );
    if (existingDocs.length === 0) continue;
    if (existingDocs.some((d) => docTouched(d, changed))) continue;
    missing.push(
      `[${rule.id}] code ${matchedCode.slice(0, 3).join(", ")}${matchedCode.length > 3 ? "…" : ""} needs one of: ${existingDocs.join(" | ")}`
    );
  }

  if (missing.length === 0) {
    console.log(
      `check:docs-affected: ok (${hits.length} rule hit(s))${strict ? " [strict]" : " [warn]"}`
    );
    process.exit(0);
  }

  const level = strict ? "FAIL" : "WARN";
  for (const m of missing) {
    console[strict ? "error" : "warn"](`${level}  ${m}`);
  }
  console.log(
    `check:docs-affected: ${missing.length} missing doc touch(es)${strict ? " [strict]" : " [warn]"}`
  );
  console.log(
    "Add the listed doc(s), or put docs:allow-affect — <reason> in the commit message / PR body."
  );

  process.exit(strict ? 1 : 0);
}

main();
