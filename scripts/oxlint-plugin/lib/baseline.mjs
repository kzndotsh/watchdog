/**
 * Shrink-only baselines for plugin rules, the same ratchet as `check-size-budget.mjs`.
 *
 * A rule that lands with existing violations wraps itself in `withBaseline(ruleId, rule)`
 * and ships `baselines/<ruleId>.json`: `{ "<repo-relative file>": <allowed count> }`.
 * While linting a file the wrapper holds the rule's reports back until `Program:exit`, then:
 *
 * - found > allowed (or the file is not listed): the reports past the allowed count fail,
 *   so a new violation fails lint;
 * - found < allowed: one report on the file fails as a stale entry, so the baseline can
 *   only shrink (lower the count or delete the entry; `scripts/oxlint-baseline.mjs` does it).
 *
 * Counts are per file, not per site: an edit that moves a baselined violation never
 * invalidates the entry. `WATCHDOG_BASELINE_OFF=1` disables the wrapper (every violation
 * reports); `scripts/oxlint-baseline.mjs` uses it to count what a rule really finds.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { isRecord } from "./ast.mjs";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
export const BASELINE_DIR = path.resolve(import.meta.dirname, "../baselines");
export const BASELINE_OFF_ENV = "WATCHDOG_BASELINE_OFF";

/**
 * @typedef {{ node: unknown, message: string }} Diagnostic
 * @typedef {{ filename: string, report: (diagnostic: Diagnostic) => void }} RuleContext
 * @typedef {Record<string, ((node: unknown) => void) | undefined>} Visitors
 * @typedef {{ create(context: object): Visitors }} Rule
 */

/**
 * @param {string} ruleId
 * @param {string} [dir]
 */
export const baselinePath = (ruleId, dir = BASELINE_DIR) =>
  path.join(dir, `${ruleId}.json`);

/**
 * Allowed violation count per repo-relative file. A missing or unreadable file is an
 * empty baseline; entries that are not non-negative integers are ignored.
 * @param {string} ruleId
 * @param {string} [dir]
 * @returns {Map<string, number>}
 */
export const readBaseline = (ruleId, dir = BASELINE_DIR) => {
  /** @type {Map<string, number>} */
  const out = new Map();
  /** @type {unknown} */
  let parsed = null;
  try {
    parsed = JSON.parse(readFileSync(baselinePath(ruleId, dir), "utf-8"));
  } catch {
    return out;
  }
  if (!isRecord(parsed)) return out;
  for (const [file, count] of Object.entries(parsed)) {
    if (Number.isInteger(count) && typeof count === "number" && count >= 0) {
      out.set(file, count);
    }
  }
  return out;
};

/**
 * Repo-relative, forward-slash form of a linted file's absolute path.
 * @param {string} filename
 */
export const repoRelative = (filename) =>
  path.relative(REPO_ROOT, filename).split(path.sep).join("/");

/**
 * Wraps `rule` so its violations are checked against `baselines/<ruleId>.json`.
 * @param {string} ruleId rule id without the plugin prefix; also the baseline file stem
 * @param {Rule} rule
 * @param {{ dir?: string }} [options] `dir` overrides the baseline directory
 */
export const withBaseline = (ruleId, rule, { dir = BASELINE_DIR } = {}) => ({
  ...rule,
  /** @param {RuleContext} context */
  create(context) {
    if (process.env[BASELINE_OFF_ENV] === "1") return rule.create(context);

    /** @type {Diagnostic[]} */
    const found = [];
    /** @param {Diagnostic} diagnostic */
    const collect = (diagnostic) => {
      found.push(diagnostic);
    };
    /** @type {ProxyHandler<object>} */
    const handler = {
      get(_target, key) {
        /** @type {unknown} */
        const value =
          key === "report" ? collect : Reflect.get(context, key, context);
        return value;
      },
    };
    // The proxy targets an empty object: oxlint freezes `context.report`, and a proxy may
    // not report a different value for a frozen property of its own target.
    const wrapped = new Proxy({}, handler);
    const visitors = rule.create(wrapped);
    const file = repoRelative(context.filename);
    const baselineFile = baselinePath(ruleId, dir);
    const where = path
      .relative(REPO_ROOT, baselineFile)
      .split(path.sep)
      .join("/");
    const exit = visitors["Program:exit"];

    return {
      ...visitors,
      /** @param {unknown} program */
      "Program:exit"(program) {
        if (typeof exit === "function") exit(program);
        const allowed = readBaseline(ruleId, dir).get(file) ?? 0;
        if (found.length > allowed) {
          for (const diagnostic of found.slice(allowed)) {
            context.report({
              node: diagnostic.node,
              message: `${diagnostic.message} (new violation: ${file} has ${found.length} of ${ruleId}, ${where} allows ${allowed}; fix the code, never raise the baseline)`,
            });
          }
        } else if (found.length < allowed) {
          context.report({
            node: program,
            message: `Stale baseline entry: ${where} allows ${allowed} ${ruleId} violation(s) in ${file} but only ${found.length} remain. Lower the count or delete the entry (node scripts/oxlint-baseline.mjs ${ruleId}).`,
          });
        }
      },
    };
  },
});
