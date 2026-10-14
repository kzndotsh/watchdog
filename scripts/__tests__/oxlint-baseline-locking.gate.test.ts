/**
 * Locking of `scripts/oxlint-baseline.mjs`: concurrent runs serialise, a fresh lock aborts the
 * run, a stale lock is reclaimed.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  A,
  BASELINE,
  FIXTURE_CONFIG,
  SCRIPT,
  read,
  stubOxlint,
  baselineFixtureFactory,
} from "./helpers/oxlint-baseline-fixture.ts";
import { LINT_TIMEOUT_MS } from "./helpers/oxlint-fixture.ts";
import type { OxlintFixture } from "./helpers/oxlint-fixture.ts";

const { scriptFixture } = baselineFixtureFactory();

const BARRIER_STUB_TIMEOUT_MS = 15_000;
const BARRIER_KILL_MS = 20_000;

describe(
  "scripts/oxlint-baseline.mjs locking",
  { timeout: LINT_TIMEOUT_MS },
  () => {
    const countStub = `const fs = require("node:fs");
const path = require("node:path");
const dir = process.env.STUB_BARRIER_DIR;
fs.writeFileSync(path.join(dir, "scanned-" + process.env.STUB_ID), "");
// Barrier: both scans finish before either run reaches the write.
const giveUpAt = Date.now() + Number(process.env.STUB_BARRIER_TIMEOUT_MS ?? ${BARRIER_STUB_TIMEOUT_MS});
const wait = () => {
  if (Date.now() > giveUpAt) {
    // The peer never arrived (it exited early): fail instead of polling forever.
    console.error("barrier: peer scan never wrote its marker");
    process.exit(3);
  }
  if (fs.existsSync(path.join(dir, "scanned-a")) && fs.existsSync(path.join(dir, "scanned-b"))) {
    const d = { message: "m", code: "watchdog(no-legacy-marker)", filename: ${JSON.stringify(A)} };
    setTimeout(() => console.log(JSON.stringify({ diagnostics: Array(Number(process.env.STUB_COUNT)).fill(d) })), Number(process.env.STUB_DELAY_MS));
  } else setTimeout(wait, 10);
};
wait();`;

    const spawnScript = (
      fixture: OxlintFixture,
      env: Record<string, string>,
      killAfterMs = BARRIER_KILL_MS
    ): Promise<number | null> =>
      new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [SCRIPT, "no-legacy-marker", "--config", FIXTURE_CONFIG],
          {
            cwd: fixture.repo.dir,
            env: { ...process.env, ...env },
            stdio: "ignore",
          }
        );
        // Backstop: a hung run is killed so the test fails fast, never hangs the worker.
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(
            new Error(
              `baseline run ${env.STUB_ID ?? "?"} did not exit within ${killAfterMs}ms (barrier peer never arrived?)`
            )
          );
        }, killAfterMs);
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      });

    it("fails fast, without polling forever, when the barrier peer never arrives", async () => {
      const fixture = scriptFixture();
      fixture.write(BASELINE, `{ "${A}": 5 }\n`);
      stubOxlint(fixture, countStub);
      const started = Date.now();
      const code = await spawnScript(
        fixture,
        {
          STUB_BARRIER_DIR: mkdtempSync(
            path.join(fixture.repo.dir, "barrier-")
          ),
          STUB_ID: "a",
          STUB_COUNT: "4",
          STUB_DELAY_MS: "0",
          STUB_BARRIER_TIMEOUT_MS: "300",
        },
        3000
      );
      expect(code).not.toBe(0);
      expect(Date.now() - started).toBeLessThan(3000);
      expect(JSON.parse(read(fixture))).toEqual({ [A]: 5 });
    });

    it(
      "serialises two concurrent runs: the earlier, higher write cannot overwrite the lower one",
      async () => {
        const fixture = scriptFixture();
        fixture.write(BASELINE, `{ "${A}": 5 }\n`);
        stubOxlint(fixture, countStub);
        const barrier = {
          STUB_BARRIER_DIR: mkdtempSync(
            path.join(fixture.repo.dir, "barrier-")
          ),
        };
        const codes = await Promise.all([
          // A enters the lock first and holds it after its re-read; B arrives while it is held.
          spawnScript(fixture, {
            ...barrier,
            STUB_ID: "a",
            STUB_COUNT: "4",
            STUB_DELAY_MS: "0",
            WATCHDOG_BASELINE_HOLD_MS: "1500",
          }),
          spawnScript(fixture, {
            ...barrier,
            STUB_ID: "b",
            STUB_COUNT: "3",
            STUB_DELAY_MS: "400",
          }),
        ]);
        expect(codes).toEqual([0, 0]);
        expect(JSON.parse(read(fixture))).toEqual({ [A]: 3 });
        expect(
          existsSync(path.join(fixture.repo.dir, `${BASELINE}.lock`))
        ).toBe(false);
      },
      LINT_TIMEOUT_MS
    );

    // A scan that reports one violation, without a real oxlint run over the fixture.
    const oneHitStub = `const d = { message: "m", code: "watchdog(no-legacy-marker)", filename: ${JSON.stringify(A)} };
console.log(JSON.stringify({ diagnostics: [d] }));`;

    it("aborts without writing when a fresh lock is held", () => {
      const fixture = scriptFixture();
      fixture.write(BASELINE, `{ "${A}": 2 }\n`);
      fixture.write(`${BASELINE}.lock`, "");
      stubOxlint(fixture, oneHitStub);
      const res = fixture.repo.runFile(SCRIPT, {
        args: ["no-legacy-marker", "--config", FIXTURE_CONFIG],
        env: { WATCHDOG_BASELINE_LOCK_TIMEOUT_MS: "300" },
      });
      expect(res.code).toBe(2);
      expect(res.output).toContain("could not take");
      expect(read(fixture)).toBe(`{ "${A}": 2 }\n`);
    });

    it("removes a stale lock left by a crashed run and proceeds", () => {
      const fixture = scriptFixture();
      fixture.write(BASELINE, `{ "${A}": 2 }\n`);
      stubOxlint(fixture, oneHitStub);
      const lock = path.join(fixture.repo.dir, `${BASELINE}.lock`);
      writeFileSync(lock, "");
      const old = new Date(Date.now() - 10 * 60_000);
      utimesSync(lock, old, old);
      const res = fixture.repo.runFile(SCRIPT, {
        args: ["no-legacy-marker", "--config", FIXTURE_CONFIG],
      });
      expect(res.code).toBe(0);
      expect(JSON.parse(read(fixture))).toEqual({ [A]: 1 });
      expect(existsSync(lock)).toBe(false);
    });
  }
);
