/**
 * `scripts/oxlint-baseline.mjs` wiring around a scan that did not really run, with a stub
 * oxlint: the baseline is left untouched and the lock is always released. Which scans count as
 * "did not run" is the pure `readScan`, tested in `oxlint-baseline-update.gate.test.ts`.
 */
import { existsSync, mkdirSync } from "node:fs";
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

const { scriptFixture } = baselineFixtureFactory();

describe(
  "scripts/oxlint-baseline.mjs hardening: scans and writes",
  { timeout: LINT_TIMEOUT_MS },
  () => {
    it("leaves the baseline untouched when the scan did not run", () => {
      const fixture = scriptFixture();
      fixture.write(BASELINE, `{ "${A}": 2 }\n`);
      const before = read(fixture);
      stubOxlint(fixture, null);
      const res = fixture.repo.runFile(SCRIPT, {
        args: ["no-legacy-marker", "--config", FIXTURE_CONFIG],
      });
      expect(res.code).not.toBe(0);
      expect(res.output).toContain("baseline left untouched");
      expect(read(fixture)).toBe(before);
    });

    it("releases the lock when --init is refused inside the critical section", () => {
      const fixture = scriptFixture();
      const target = path.join(fixture.repo.dir, BASELINE);
      mkdirSync(path.dirname(target), { recursive: true });
      // The baseline appears mid-scan, after the early --init check and before the lock.
      stubOxlint(
        fixture,
        `require("node:fs").writeFileSync(${JSON.stringify(target)}, '{}\\n');
console.log(JSON.stringify({ diagnostics: [] }));`
      );
      const res = fixture.repo.runFile(SCRIPT, {
        args: ["no-legacy-marker", "--init", "--config", FIXTURE_CONFIG],
      });
      expect(res.code).toBe(1);
      expect(res.output).toContain("baseline already exists");
      expect(existsSync(`${target}.lock`)).toBe(false);
    });
  }
);
