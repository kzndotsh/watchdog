/**
 * Shared git helpers for gate scripts (validate-agents, changed-packages, the
 * Cursor stop hook). One rule: a git failure is never read as "nothing changed". Every
 * helper here THROWS (with git's stderr) instead of returning an empty answer, except
 * `tryGit`, which returns null for probes where failure is a real answer (does this ref
 * exist?), so a gate that calls them fails loudly when its diff is broken. Callers decide
 * how to surface the error (the gates `die`; the stop hook deliberately fails open).
 */
import { spawnSync } from "node:child_process";

const ZERO_SHA = /^0+$/;

/**
 * Run git and return stdout.
 * @param {readonly string[]} args
 * @param {string} [cwd]
 * @returns {string}
 * @throws {Error} with git's stderr when git exits non-zero or cannot start
 */
export function git(args, cwd = process.cwd()) {
  const res = spawnSync("git", args, { cwd, encoding: "utf-8" });
  if (res.error) {
    throw new Error(
      `git ${args.join(" ")} could not run: ${res.error.message}`
    );
  }
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || "").trim();
    throw new Error(
      `git ${args.join(" ")} exited ${res.status}${detail ? `: ${detail}` : ""}`
    );
  }
  return res.stdout;
}

/**
 * For probes where failure is a legitimate answer (does this ref exist?).
 * @param {readonly string[]} args
 * @param {string} [cwd]
 * @returns {string | null} trimmed stdout, or null when git fails
 */
export function tryGit(args, cwd = process.cwd()) {
  try {
    return git(args, cwd).trim();
  } catch {
    return null;
  }
}

/**
 * @param {string} text
 * @returns {string[]} unique, trimmed, non-empty lines
 */
export function lines(text) {
  return [
    ...new Set(
      text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    ),
  ];
}

/**
 * @param {string} sha
 * @param {string} [cwd]
 */
export function commitExists(sha, cwd = process.cwd()) {
  return tryGit(["cat-file", "-e", `${sha}^{commit}`], cwd) !== null;
}

/**
 * @param {string} baseRef branch name, tried as origin/<baseRef> then <baseRef>
 * @param {string} [cwd]
 * @returns {string | null} merge-base SHA with HEAD, null when neither ref resolves
 */
export function mergeBaseWith(baseRef, cwd = process.cwd()) {
  for (const ref of [`origin/${baseRef}`, baseRef]) {
    const mb = tryGit(["merge-base", ref, "HEAD"], cwd);
    if (mb) return mb;
  }
  return null;
}

/**
 * Resolve a pushed range. An empty or all-zero `before` (new branch, workflow
 * dispatch) falls back to the merge base with origin/main, then main.
 * @param {{ before?: string; after?: string }} range
 * @param {string} [cwd]
 * @returns {{ start: string; after: string }}
 * @throws {Error} when either end is not a commit in this clone, or no fallback exists
 */
export function resolvePushRange(
  { before = "", after = "HEAD" },
  cwd = process.cwd()
) {
  if (!commitExists(after, cwd)) {
    throw new Error(`push range end ${after} is not a commit in this clone`);
  }
  if (before && !ZERO_SHA.test(before)) {
    if (!commitExists(before, cwd)) {
      throw new Error(
        `push range start ${before} is not a commit in this clone (shallow fetch or force-push?)`
      );
    }
    return { start: before, after };
  }
  for (const ref of ["origin/main", "main"]) {
    const start = tryGit(["merge-base", ref, after], cwd);
    if (start) return { start, after };
  }
  throw new Error(
    "before SHA is empty and no merge base with main can be found"
  );
}

/**
 * Paths changed by a diff, repo-relative.
 * @param {readonly string[]} diffArgs arguments between `git diff` and `--`
 * @param {string} [cwd]
 * @returns {string[]}
 * @throws {Error} when the diff cannot be computed (e.g. an unresolvable range)
 */
export function changedPaths(diffArgs, cwd = process.cwd()) {
  return lines(
    git(["diff", "--name-only", "--diff-filter=ACMR", ...diffArgs, "--"], cwd)
  );
}
