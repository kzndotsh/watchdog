/**
 * The decisions behind `scripts/oxlint-baseline.mjs`, as pure functions: argument and
 * test-seam parsing, the check that a scan really ran, per-file counts, the shrink plan and
 * the final merge. The script keeps only the I/O (spawning oxlint, the lock file, the write),
 * so the gate tests assert these rules without spawning a process.
 */
import { isRecord } from "./ast.mjs";

export const PLUGIN_CRASH = "Error running JS plugin";
export const LOCK_STALE_MS = 60_000;
export const DEFAULT_LOCK_TIMEOUT_MS = 10_000;
/**
 * Test seam: hold the lock this long after the re-read, so a gate test can force contention.
 * Capped well below LOCK_STALE_MS: a longer hold would let another run treat the live lock
 * as stale and remove it.
 */
export const MAX_HOLD_MS = LOCK_STALE_MS / 2;

/**
 * Lock-wait timeout from `WATCHDOG_BASELINE_LOCK_TIMEOUT_MS`. A NaN or non-positive value
 * would make the wait loop never (or instantly) give up, so it falls back to the default.
 * @param {string | undefined} raw
 * @returns {number}
 */
export const parseLockTimeoutMs = (raw) => {
  const requested = Number(raw ?? DEFAULT_LOCK_TIMEOUT_MS);
  return Number.isInteger(requested) && requested > 0
    ? requested
    : DEFAULT_LOCK_TIMEOUT_MS;
};

/**
 * Lock hold from `WATCHDOG_BASELINE_HOLD_MS`: a finite number from 0 to MAX_HOLD_MS.
 * Anything else is rejected, not clamped.
 * @param {string | undefined} raw
 * @returns {number | null} milliseconds, or null when the value is unsafe
 */
export const parseHoldMs = (raw) => {
  const hold = Number(raw ?? 0);
  return Number.isFinite(hold) && hold >= 0 && hold <= MAX_HOLD_MS
    ? hold
    : null;
};

/**
 * @param {readonly string[]} argv arguments after the script name
 * @returns {{ init: boolean, config: string, ruleId: string | undefined }}
 */
export const parseArgs = (argv) => {
  const configAt = argv.indexOf("--config");
  return {
    init: argv.includes("--init"),
    config: configAt === -1 ? "oxlint.config.ts" : (argv[configAt + 1] ?? ""),
    // The value after `--config` is not the rule id; with no `--config`, nothing is skipped.
    ruleId: argv.find(
      (arg, i) =>
        !arg.startsWith("--") && (configAt === -1 || i !== configAt + 1)
    ),
  };
};

/**
 * A scan that did not really run must never rewrite or delete a baseline.
 * @param {{ error?: Error | null, stdout?: unknown }} res a `spawnSync` result
 * @returns {{ diagnostics: unknown[] } | { abort: string }}
 */
export const readScan = (res) => {
  if (res.error || typeof res.stdout !== "string") {
    return {
      abort: `oxlint did not run (${res.error?.message ?? "no output"})`,
    };
  }
  /** @type {unknown} */
  let report = null;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    return { abort: "no JSON report from oxlint" };
  }
  if (!isRecord(report) || !Array.isArray(report.diagnostics)) {
    return { abort: "oxlint report has no diagnostics array" };
  }
  /** @type {unknown[]} */
  const diagnostics = report.diagnostics;
  for (const d of diagnostics) {
    if (!isRecord(d)) {
      return { abort: "oxlint report has a malformed diagnostic entry" };
    }
    const crashed =
      typeof d.message === "string" && d.message.startsWith(PLUGIN_CRASH);
    // Every rule diagnostic carries `plugin(rule)`; a parse error does not.
    const noRule = typeof d.code !== "string" || d.code === "";
    if (crashed || noRule) {
      return {
        abort: `scan incomplete (${String(d.message)} in ${String(d.filename)}), fix it first`,
      };
    }
  }
  return { diagnostics };
};

/**
 * What the rule really finds, per file.
 * @param {readonly unknown[]} diagnostics
 * @param {string} ruleId
 * @returns {Map<string, number>}
 */
export const countByFile = (diagnostics, ruleId) => {
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
  return current;
};

/**
 * The counts to write and the violations that may not be recorded. `--init` records
 * everything; a shrink refuses a file the baseline does not list or a count above its
 * allowance: new violations are fixed, not recorded.
 * @param {{ init: boolean, current: ReadonlyMap<string, number>, existing: ReadonlyMap<string, number>, ruleId: string }} input
 * @returns {{ next: Map<string, number>, failures: string[] }}
 */
export const planUpdate = ({ init, current, existing, ruleId }) => {
  /** @type {Map<string, number>} */
  const next = new Map();
  /** @type {string[]} */
  const failures = [];
  for (const [file, count] of current) {
    if (init) {
      next.set(file, count);
      continue;
    }
    const allowed = existing.get(file);
    if (allowed === undefined || count > allowed) {
      failures.push(
        `${file}: ${count} ${ruleId} violation(s), baseline allows ${allowed ?? 0}; fix them`
      );
    } else {
      next.set(file, count);
    }
  }
  return { next, failures };
};

/**
 * The record to write, merged under the lock with `fresh`, the baseline re-read there (null
 * for `--init`): a concurrent shrink may have lowered counts or dropped files since the
 * scan, and a write must never raise an allowance or revive an entry.
 * @param {{ next: ReadonlyMap<string, number>, fresh: ReadonlyMap<string, number> | null }} input
 * @returns {Record<string, number>} empty when the baseline should be deleted
 */
export const mergeUnderLock = ({ next, fresh }) => {
  /** @type {Record<string, number>} */
  const sorted = {};
  for (const file of [...next.keys()].sort((a, b) => a.localeCompare(b))) {
    const count = next.get(file) ?? 0;
    const now = fresh === null ? count : fresh.get(file);
    if (now !== undefined) sorted[file] = Math.min(count, now);
  }
  return sorted;
};
