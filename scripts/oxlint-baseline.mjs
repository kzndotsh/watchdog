#!/usr/bin/env node
/**
 * Writes or shrinks a plugin rule's baseline (scripts/oxlint-plugin/baselines/<rule>.json).
 *
 *   node scripts/oxlint-baseline.mjs <rule-id> --init   first baseline: current counts
 *   node scripts/oxlint-baseline.mjs <rule-id>          shrink: lower counts, drop gone entries
 *
 * Counts come from a real oxlint run with the baseline wrapper off, so they are what
 * the rule finds, not what the old baseline allowed. Shrinking never raises an entry and
 * refuses a violation that is not baselined: new violations are fixed, not recorded.
 * `--config <path>` lints with another oxlint config (fixture repos in the gate tests).
 */
import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  LOCK_STALE_MS,
  countByFile,
  mergeUnderLock,
  parseArgs,
  parseHoldMs,
  parseLockTimeoutMs,
  planUpdate,
  readScan,
} from "./oxlint-plugin/lib/baseline-update.mjs";
import {
  BASELINE_OFF_ENV,
  REPO_ROOT,
  baselinePath,
  readBaseline,
} from "./oxlint-plugin/lib/baseline.mjs";

// The decisions (argument and seam parsing, scan checks, shrink plan, merge) are pure and live
// in oxlint-plugin/lib/baseline-update.mjs; this file is the I/O around them.
const LOCK_TIMEOUT_MS = parseLockTimeoutMs(
  process.env.WATCHDOG_BASELINE_LOCK_TIMEOUT_MS
);
const HOLD_MS = parseHoldMs(process.env.WATCHDOG_BASELINE_HOLD_MS);
if (HOLD_MS === null) {
  console.error(
    `oxlint-baseline: WATCHDOG_BASELINE_HOLD_MS must be a finite number from 0 to ${LOCK_STALE_MS / 2}, got ${process.env.WATCHDOG_BASELINE_HOLD_MS}`
  );
  process.exit(2);
}

const { init, config, ruleId } = parseArgs(process.argv.slice(2));

if (!ruleId || !config) {
  console.error(
    "usage: node scripts/oxlint-baseline.mjs <rule-id> [--init] [--config <path>]"
  );
  process.exit(2);
}

// Read before the slow scan; the write below re-reads to catch a concurrent shrink.
const target = baselinePath(ruleId);
const existing = readBaseline(ruleId);

const res = spawnSync(
  path.join(REPO_ROOT, "node_modules/.bin/oxlint"),
  ["-c", config, "--format", "json", "."],
  {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    env: { ...process.env, [BASELINE_OFF_ENV]: "1" },
    maxBuffer: 256 * 1024 * 1024,
  }
);

/**
 * A scan that did not really run must never rewrite or delete a baseline: abort first.
 * @param {string} reason
 * @returns {never}
 */
const abort = (reason) => {
  console.error(
    `oxlint-baseline: ${reason}; baseline left untouched\n${res.stderr ?? ""}`
  );
  process.exit(2);
};

const scan = readScan(res);
const current = countByFile(
  "abort" in scan ? abort(scan.abort) : scan.diagnostics,
  ruleId
);

// Any existing file (empty, malformed, no valid entries) still means "already initialised".
if (init && existsSync(target)) {
  console.error(
    `✗ ${ruleId}: baseline already exists; run without --init to shrink it`
  );
  process.exit(1);
}
const { next, failures } = planUpdate({ init, current, existing, ruleId });

if (failures.length > 0) {
  for (const f of failures) console.error(`✗ ${f}`);
  process.exit(1);
}

/**
 * Runs `fn` holding an exclusive per-rule lock file (`<baseline>.lock`, created with the
 * `wx` flag), so concurrent runs cannot interleave their read-modify-write. A lock older
 * than LOCK_STALE_MS belongs to a crashed run and is removed; waiting longer than
 * LOCK_TIMEOUT_MS aborts without touching the baseline.
 * @param {() => number} fn
 * @returns {number}
 */
const withLock = (fn) => {
  const lock = `${target}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  mkdirSync(path.dirname(target), { recursive: true });
  let fd = -1;
  let announced = false;
  while (fd === -1) {
    try {
      fd = openSync(lock, "wx");
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "EEXIST")
      ) {
        throw error;
      }
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS)
          unlinkSync(lock);
      } catch {
        // Released by its owner in the meantime: retry.
      }
      if (!announced) {
        // The gate tests read the timeout from this line instead of waiting it out.
        console.error(
          `oxlint-baseline: waiting for ${lock} (gives up after ${LOCK_TIMEOUT_MS}ms)`
        );
        announced = true;
      }
      if (Date.now() > deadline) abort(`could not take ${lock}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    rmSync(lock, { force: true });
  }
};

// The critical section returns the exit code instead of calling process.exit, which would
// skip `finally` and leave the lock file behind.
const exitCode = withLock(() => {
  // Re-read under the lock: a concurrent shrink may have lowered counts or dropped
  // files since the scan, and a write must never raise an allowance or revive an entry.
  if (init && existsSync(target)) {
    console.error(
      `✗ ${ruleId}: baseline already exists; run without --init to shrink it`
    );
    return 1;
  }
  const sorted = mergeUnderLock({
    next,
    fresh: init ? null : readBaseline(ruleId),
  });
  if (HOLD_MS > 0)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, HOLD_MS);
  const size = Object.keys(sorted).length;
  if (size === 0) {
    rmSync(target, { force: true });
    console.log(`oxlint-baseline: ${ruleId} is clean, baseline removed`);
    return 0;
  }
  // Write beside the target and rename, so a concurrent reader never sees partial JSON.
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(sorted, null, 2)}\n`);
  renameSync(tmp, target);
  console.log(`oxlint-baseline: ${ruleId} baseline written (${size} file(s))`);
  return 0;
});
process.exit(exitCode);
