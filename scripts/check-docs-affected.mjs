#!/usr/bin/env node
/**
 * Docs-affect gate: code changes need a paired, substantive doc touch per
 * scripts/doc-map.mjs, judged on exactly the change being made.
 *
 * Stages:
 * - commit-msg (lefthook): `node scripts/check-docs-affected.mjs --strict --strict-only {1}`.
 *   Reads the real message file `{1}` and diffs the index (staged changes) only.
 * - CI pull_request: diffs merge-base(origin/<base>, HEAD)...HEAD.
 * - CI push: diffs the pushed range before..after (GITHUB_EVENT_PATH payload, or
 *   DOCS_AFFECT_BEFORE / DOCS_AFFECT_AFTER env). An all-zero before SHA falls back
 *   to the merge base with main. A range that cannot be resolved FAILS: it never
 *   degrades to "no changes".
 *
 * Escape hatch: `docs:allow-affect — <reason>` in the commit message being
 * written (reason required). In CI, a pull request body or any commit message in
 * the pushed range may carry it. There are no other fallbacks.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { DOC_MAP, hasAllowAffect, matchRules } from "./doc-map.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const strict =
  args.includes("--strict") || process.env.CHECK_DOCS_STRICT === "1";
const strictOnly = args.includes("--strict-only");
const msgFile = args.find((a) => !a.startsWith("--"));
const inCI = process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";
const ZERO_SHA = /^0+$/;

const ESCAPE_SYNTAX = "docs:allow-affect — <reason>";

/**
 * @param {string} message
 * @returns {never}
 */
function die(message) {
  console.error(`FAIL  check:docs-affected: ${message}`);
  process.exit(1);
}

/**
 * @param {string[]} gitArgs
 * @returns {string} stdout; throws when git fails
 */
function git(gitArgs) {
  return execFileSync("git", gitArgs, {
    cwd: root,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * @param {string[]} gitArgs
 * @returns {string | null} trimmed stdout, null when git fails
 */
function tryGit(gitArgs) {
  try {
    return git(gitArgs).trim();
  } catch {
    return null;
  }
}

/** @param {string} text */
function lines(text) {
  return [
    ...new Set(
      text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    ),
  ];
}

/** Self-check: no rule may list the same doc twice. */
function checkDocMap() {
  for (const rule of DOC_MAP) {
    const seen = new Set();
    for (const doc of rule.docs) {
      if (seen.has(doc)) {
        die(`doc map rule "${rule.id}" lists ${doc} twice`);
      }
      seen.add(doc);
    }
  }
}

/** @param {string} sha */
function commitExists(sha) {
  return tryGit(["cat-file", "-e", `${sha}^{commit}`]) !== null;
}

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function str(value) {
  return typeof value === "string" ? value : undefined;
}

/** @returns {{ isPullRequest: boolean; prBody: string; before?: string; after?: string }} */
function readEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  /** @type {unknown} */
  let event = {};
  if (eventPath && existsSync(eventPath)) {
    try {
      event = JSON.parse(readFileSync(eventPath, "utf-8"));
    } catch {
      event = {};
    }
  }
  const e = event && typeof event === "object" ? event : {};
  const pr = "pull_request" in e ? e.pull_request : undefined;
  return {
    isPullRequest:
      process.env.GITHUB_EVENT_NAME === "pull_request" || pr !== undefined,
    prBody:
      pr && typeof pr === "object" && "body" in pr ? (str(pr.body) ?? "") : "",
    before: "before" in e ? str(e.before) : undefined,
    after: "after" in e ? str(e.after) : undefined,
  };
}

/** @param {string} baseRef */
function mergeBaseWith(baseRef) {
  for (const ref of [`origin/${baseRef}`, baseRef]) {
    const mb = tryGit(["merge-base", ref, "HEAD"]);
    if (mb) return mb;
  }
  return null;
}

/**
 * Resolve what is being judged.
 * @returns {{ label: string; diffArgs: string[]; messages: string[] }}
 *   `diffArgs` go between `git diff` and `--`; `messages` carry escape hatches.
 */
function resolveChange() {
  if (!inCI) {
    const message =
      msgFile && existsSync(msgFile) ? readFileSync(msgFile, "utf-8") : "";
    // Comment lines are stripped by git before the commit is created.
    const body = message
      .split("\n")
      .filter((l) => !l.startsWith("#"))
      .join("\n");
    return { label: "staged", diffArgs: ["--cached"], messages: [body] };
  }

  const event = readEvent();
  if (event.isPullRequest) {
    const baseRef = process.env.GITHUB_BASE_REF ?? "main";
    const mb = mergeBaseWith(baseRef);
    if (!mb)
      die(
        `cannot resolve merge base with ${baseRef}; refusing to report "no changes"`
      );
    return {
      label: `pull request (${mb.slice(0, 8)}...HEAD)`,
      diffArgs: [`${mb}...HEAD`],
      messages: [event.prBody],
    };
  }

  const before = event.before ?? process.env.DOCS_AFFECT_BEFORE ?? "";
  const after = event.after ?? process.env.DOCS_AFFECT_AFTER ?? "HEAD";
  if (!commitExists(after))
    die(`push range end ${after} is not a commit in this clone`);
  let start = before;
  if (!before || ZERO_SHA.test(before)) {
    start = "";
    for (const ref of ["origin/main", "main"]) {
      start = tryGit(["merge-base", ref, after]) ?? "";
      if (start) break;
    }
    if (!start)
      die("before SHA is empty and no merge base with main can be found");
  } else if (!commitExists(before)) {
    die(
      `push range start ${before} is not a commit in this clone (shallow fetch or force-push?)`
    );
  }
  const log = tryGit(["log", "--format=%B%x00", `${start}..${after}`]);
  if (log === null) die(`cannot list commits in ${start}..${after}`);
  return {
    label: `push (${start.slice(0, 8)}..${after.slice(0, 8)})`,
    diffArgs: [`${start}..${after}`],
    messages: log.split("\0"),
  };
}

/**
 * @param {string[]} diffArgs
 * @returns {string[]} changed paths
 */
function changedPaths(diffArgs) {
  try {
    return lines(
      git(["diff", "--name-only", "--diff-filter=ACMR", ...diffArgs, "--"])
    );
  } catch (error) {
    return die(`git diff ${diffArgs.join(" ")} failed: ${String(error)}`);
  }
}

/**
 * A doc counts as touched only when its diff has a non-whitespace change.
 * @param {string} file
 * @param {string[]} diffArgs
 */
function substantive(file, diffArgs) {
  try {
    git([
      "diff",
      "--quiet",
      "-w",
      "--ignore-blank-lines",
      ...diffArgs,
      "--",
      file,
    ]);
    // Exit 0: no differences once whitespace is ignored.
    return false;
  } catch {
    return true;
  }
}

/**
 * @param {string} docPattern
 * @param {string[]} changed
 * @param {string[]} diffArgs
 */
function docTouched(docPattern, changed, diffArgs) {
  const candidates = docPattern.endsWith("/")
    ? changed.filter(
        (f) => f.startsWith(docPattern) || f === docPattern.slice(0, -1)
      )
    : changed.filter((f) => f === docPattern);
  return candidates.some((f) => substantive(f, diffArgs));
}

function main() {
  checkDocMap();

  const { label, diffArgs, messages } = resolveChange();
  if (messages.some((m) => hasAllowAffect(m))) {
    console.log("check:docs-affected: allow-affect present — skip");
    process.exit(0);
  }

  const changed = changedPaths(diffArgs);
  if (changed.length === 0) {
    console.log(`check:docs-affected: no changes in ${label}`);
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
    if (existingDocs.some((d) => docTouched(d, changed, diffArgs))) continue;
    missing.push(
      `[${rule.id}] changed ${matchedCode.slice(0, 3).join(", ")}${matchedCode.length > 3 ? "…" : ""} — update one of: ${existingDocs.join(" | ")}`
    );
  }

  if (missing.length === 0) {
    console.log(
      `check:docs-affected: ok (${hits.length} rule hit(s), ${label})${strict ? " [strict]" : " [warn]"}`
    );
    process.exit(0);
  }

  const level = strict ? "FAIL" : "WARN";
  for (const m of missing) {
    console[strict ? "error" : "warn"](`${level}  ${m}`);
  }
  console.log(
    `check:docs-affected: ${missing.length} missing doc touch(es) in ${label}${strict ? " [strict]" : " [warn]"}`
  );
  console.log(
    `Make a substantive (non-whitespace) edit to a listed doc, or excuse this commit with ${ESCAPE_SYNTAX} (reason required) in its own commit message.`
  );

  process.exit(strict ? 1 : 0);
}

main();
