/**
 * Argument and test-seam validation of `scripts/oxlint-baseline.mjs`.
 */

import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  A,
  BASELINE,
  FIXTURE_CONFIG,
  SCRIPT,
  read,
  baselineFixtureFactory,
  withLegacy,
} from "./helpers/oxlint-baseline-fixture.ts";
import { LINT_TIMEOUT_MS } from "./helpers/oxlint-fixture.ts";

const { scriptFixture } = baselineFixtureFactory();

describe(
  "scripts/oxlint-baseline.mjs arguments and test seams",
  { timeout: LINT_TIMEOUT_MS },
  () => {
    it.each(["Infinity", "NaN", "abc", "-1", "30001", "60000"])(
      "rejects the unsafe test-seam hold %j before scanning or writing",
      (value) => {
        const fixture = scriptFixture();
        fixture.write(BASELINE, `{ "${A}": 2 }\n`);
        fixture.write(A, withLegacy(1));
        const res = fixture.repo.runFile(SCRIPT, {
          args: ["no-legacy-marker", "--config", FIXTURE_CONFIG],
          env: { WATCHDOG_BASELINE_HOLD_MS: value },
        });
        expect(res.code).toBe(2);
        expect(res.output).toContain("WATCHDOG_BASELINE_HOLD_MS");
        expect(read(fixture)).toBe(`{ "${A}": 2 }\n`);
      },
      LINT_TIMEOUT_MS
    );

    // Ambient test-seam variables would change the notice (or exit before it).
    const {
      WATCHDOG_BASELINE_LOCK_TIMEOUT_MS: _lock,
      WATCHDOG_BASELINE_HOLD_MS: _hold,
      ...ambientEnv
    } = process.env;

    /**
     * Run against a held lock and report the timeout the run announces, then kill it: the
     * default 10 s is asserted from the notice, never waited out.
     */
    const announcedTimeoutMs = (
      env: Record<string, string>
    ): Promise<number> => {
      const fixture = scriptFixture();
      fixture.write(BASELINE, `{ "${A}": 2 }\n`);
      fixture.write(A, withLegacy(1));
      fixture.write(`${BASELINE}.lock`, "");
      return new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [SCRIPT, "no-legacy-marker", "--config", FIXTURE_CONFIG],
          {
            cwd: fixture.repo.dir,
            env: {
              ...ambientEnv,
              ...env,
            },
            stdio: ["ignore", "ignore", "pipe"],
          }
        );
        let stderr = "";
        const timer = setTimeout(() => child.kill("SIGKILL"), 20_000);
        const settle = (fn: () => void) => {
          clearTimeout(timer);
          child.kill("SIGKILL");
          fn();
        };
        child.on("close", () =>
          settle(() => reject(new Error(`no lock-wait notice: ${stderr}`)))
        );
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
          const ms = /gives up after (\d+)ms/.exec(stderr)?.[1];
          if (ms !== undefined) settle(() => resolve(Number(ms)));
        });
      });
    };

    it("waits the default 10 s for a held lock", async () => {
      expect(await announcedTimeoutMs({})).toBe(10_000);
    });

    it("honours a valid lock timeout from the test seam", async () => {
      expect(
        await announcedTimeoutMs({ WATCHDOG_BASELINE_LOCK_TIMEOUT_MS: "750" })
      ).toBe(750);
    });

    it.each(["abc", "-5", "0", "1.5"])(
      "falls back to the default lock timeout for %j instead of hanging",
      async (value) => {
        expect(
          await announcedTimeoutMs({ WATCHDOG_BASELINE_LOCK_TIMEOUT_MS: value })
        ).toBe(10_000);
      }
    );
  }
);
