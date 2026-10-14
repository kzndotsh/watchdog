/**
 * The decisions behind `scripts/oxlint-baseline.mjs` (`oxlint-plugin/lib/baseline-update.mjs`)
 * as pure functions: seam and argument parsing, the check that a scan really ran, the shrink
 * plan and the merge under the lock. No process, no oxlint. The script's wiring (spawn, lock,
 * write) is in `oxlint-baseline.gate.test.ts`, `-scans` and `-locking`.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCK_TIMEOUT_MS,
  MAX_HOLD_MS,
  countByFile,
  mergeUnderLock,
  parseArgs,
  parseHoldMs,
  parseLockTimeoutMs,
  planUpdate,
  readScan,
} from "../oxlint-plugin/lib/baseline-update.mjs";

const A = "packages/core/src/a.ts";
const B = "packages/core/src/b.ts";
const diag = (filename: string, code = "watchdog(r)") => ({
  message: "m",
  code,
  filename,
});
const counts = (entries: Record<string, number>) =>
  new Map(Object.entries(entries));

describe("parseHoldMs", () => {
  it.each(["Infinity", "NaN", "abc", "-1", "30001", "60000"])(
    "rejects the unsafe test-seam hold %j",
    (value) => {
      expect(parseHoldMs(value)).toBeNull();
    }
  );

  it("accepts unset, zero and the cap", () => {
    expect(parseHoldMs(undefined)).toBe(0);
    expect(parseHoldMs("0")).toBe(0);
    expect(parseHoldMs(String(MAX_HOLD_MS))).toBe(MAX_HOLD_MS);
  });

  it("makes the real script exit 2 before scanning or writing", () => {
    const script = path.resolve(import.meta.dirname, "../oxlint-baseline.mjs");
    const res = spawnSync(process.execPath, [script, "no-such-rule"], {
      encoding: "utf-8",
      env: { ...process.env, WATCHDOG_BASELINE_HOLD_MS: "Infinity" },
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("WATCHDOG_BASELINE_HOLD_MS");
  });
});

describe("parseLockTimeoutMs", () => {
  it("defaults to 10 s and honours a valid value", () => {
    expect(parseLockTimeoutMs(undefined)).toBe(DEFAULT_LOCK_TIMEOUT_MS);
    expect(DEFAULT_LOCK_TIMEOUT_MS).toBe(10_000);
    expect(parseLockTimeoutMs("750")).toBe(750);
  });

  it.each(["abc", "-5", "0", "1.5", "Infinity"])(
    "falls back to the default for %j instead of hanging",
    (value) => {
      expect(parseLockTimeoutMs(value)).toBe(DEFAULT_LOCK_TIMEOUT_MS);
    }
  );
});

describe("parseArgs", () => {
  it("defaults the config and finds the rule id after the flags", () => {
    expect(parseArgs(["--init", "no-legacy-marker"])).toEqual({
      init: true,
      config: "oxlint.config.ts",
      ruleId: "no-legacy-marker",
    });
  });

  it("does not take the value of --config for the rule id", () => {
    expect(parseArgs(["--config", "x.config.ts", "rule"])).toEqual({
      init: false,
      config: "x.config.ts",
      ruleId: "rule",
    });
    expect(parseArgs(["rule", "--config"]).config).toBe("");
    expect(parseArgs(["--config", "x.config.ts"]).ruleId).toBeUndefined();
  });
});

describe("readScan", () => {
  it("returns the diagnostics of a scan that ran", () => {
    expect(
      readScan({ stdout: JSON.stringify({ diagnostics: [diag(A)] }) })
    ).toEqual({ diagnostics: [diag(A)] });
  });

  it.each([
    ["oxlint cannot be spawned", { error: new Error("ENOENT") }],
    ["oxlint prints no output", { stdout: undefined }],
    ["oxlint prints JSON null", { stdout: "null" }],
    ["oxlint prints no JSON", { stdout: "boom" }],
    ["oxlint prints no diagnostics array", { stdout: "{}" }],
    ["a diagnostic is malformed", { stdout: '{"diagnostics":[1]}' }],
    [
      "a plugin crashes",
      {
        stdout: JSON.stringify({
          diagnostics: [
            {
              message: "Error running JS plugin.\nFile path: x",
              code: "",
              filename: "x.ts",
            },
          ],
        }),
      },
    ],
    [
      "a file fails to parse",
      {
        stdout: JSON.stringify({
          diagnostics: [{ message: "Unexpected token", filename: "x.ts" }],
        }),
      },
    ],
  ])("aborts when %s", (_name, res) => {
    expect(readScan(res)).toHaveProperty("abort");
  });
});

describe("countByFile", () => {
  it("counts only the named rule's diagnostics, per file", () => {
    expect(
      countByFile(
        [
          diag(A),
          diag(A),
          diag(B),
          diag(A, "watchdog(other)"),
          diag(B, "eslint(x)"),
        ],
        "r"
      )
    ).toEqual(counts({ [A]: 2, [B]: 1 }));
  });
});

describe("planUpdate", () => {
  const plan = (
    init: boolean,
    current: Record<string, number>,
    existing: Record<string, number>
  ) =>
    planUpdate({
      init,
      current: counts(current),
      existing: counts(existing),
      ruleId: "r",
    });

  it("--init records every current count", () => {
    expect(plan(true, { [A]: 2, [B]: 1 }, {})).toEqual({
      next: counts({ [A]: 2, [B]: 1 }),
      failures: [],
    });
  });

  it("shrinks: lowers counts and drops files that are gone", () => {
    expect(plan(false, { [A]: 1 }, { [A]: 3, [B]: 1 })).toEqual({
      next: counts({ [A]: 1 }),
      failures: [],
    });
  });

  it("refuses a count above the allowance and an unlisted file", () => {
    const { next, failures } = plan(false, { [A]: 2, [B]: 1 }, { [A]: 1 });
    expect(next.size).toBe(0);
    expect(failures).toHaveLength(2);
    expect(failures[0]).toContain("baseline allows 1");
    expect(failures[1]).toContain("baseline allows 0");
  });
});

describe("mergeUnderLock", () => {
  it("never writes a count higher than the baseline holds at write time", () => {
    expect(
      mergeUnderLock({ next: counts({ [A]: 2 }), fresh: counts({ [A]: 1 }) })
    ).toEqual({ [A]: 1 });
  });

  it("does not revive an entry a concurrent run already removed", () => {
    expect(
      mergeUnderLock({ next: counts({ [A]: 1 }), fresh: counts({}) })
    ).toEqual({});
  });

  it("writes --init counts as scanned, sorted by file", () => {
    const merged = mergeUnderLock({
      next: counts({ [B]: 1, [A]: 2 }),
      fresh: null,
    });
    expect(Object.keys(merged)).toEqual([A, B]);
    expect(merged).toEqual({ [A]: 2, [B]: 1 });
  });
});
