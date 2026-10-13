/**
 * `scripts/oxlint-baseline.mjs` reading and writing baselines: it writes and shrinks them but
 * never raises one. The helper, scan hardening, locking, arguments and layout live in the
 * sibling `oxlint-baseline-*.gate.test.ts` files.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BASELINE,
  FIXTURE_CONFIG,
  RULE,
  lintRule,
  baselineFixtureFactory,
  withLegacy,
} from "./helpers/oxlint-baseline-fixture.ts";
import { LINT_TIMEOUT_MS } from "./helpers/oxlint-fixture.ts";
import type { OxlintFixture } from "./helpers/oxlint-fixture.ts";

const { scriptFixture } = baselineFixtureFactory();

describe("scripts/oxlint-baseline.mjs", { timeout: LINT_TIMEOUT_MS }, () => {
  const SCRIPT = "scripts/oxlint-baseline.mjs";
  const run = (fixture: OxlintFixture, ...args: string[]) =>
    fixture.repo.runFile(SCRIPT, {
      args: ["no-legacy-marker", "--config", FIXTURE_CONFIG, ...args],
    });

  const baselineOf = (fixture: OxlintFixture) =>
    readFileSync(path.join(fixture.repo.dir, BASELINE), "utf-8");

  it("--init records the current counts and the result lints clean", () => {
    const fixture = scriptFixture();
    fixture.write("packages/core/src/a.ts", withLegacy(2));
    fixture.write("packages/core/src/b.ts", withLegacy(1));
    const res = run(fixture, "--init");
    expect(res.code).toBe(0);
    expect(JSON.parse(baselineOf(fixture))).toEqual({
      "packages/core/src/a.ts": 2,
      "packages/core/src/b.ts": 1,
    });
    expect(
      lintRule(fixture, ["packages/core/src"]).findings.filter(
        (f) => f.rule === RULE
      )
    ).toHaveLength(0);
  });

  it("shrinks counts, drops fixed files and deletes an empty baseline", () => {
    const fixture = scriptFixture();
    fixture.write("packages/core/src/a.ts", withLegacy(1));
    fixture.write(
      BASELINE,
      '{ "packages/core/src/a.ts": 3, "packages/core/src/gone.ts": 1 }\n'
    );
    expect(run(fixture).code).toBe(0);
    expect(JSON.parse(baselineOf(fixture))).toEqual({
      "packages/core/src/a.ts": 1,
    });
    fixture.write("packages/core/src/a.ts", "export const clean = 1;\n");
    expect(run(fixture).code).toBe(0);
    expect(existsSync(path.join(fixture.repo.dir, BASELINE))).toBe(false);
  });

  it("refuses to record a violation the baseline does not allow", () => {
    const fixture = scriptFixture();
    fixture.write("packages/core/src/a.ts", withLegacy(2));
    fixture.write(BASELINE, '{ "packages/core/src/a.ts": 1 }\n');
    const res = run(fixture);
    expect(res.code).toBe(1);
    expect(res.output).toContain("baseline allows 1");
    expect(JSON.parse(baselineOf(fixture))).toEqual({
      "packages/core/src/a.ts": 1,
    });
  });

  it("refuses --init over an existing baseline", () => {
    const fixture = scriptFixture();
    fixture.write("packages/core/src/a.ts", withLegacy(1));
    fixture.write(BASELINE, '{ "packages/core/src/a.ts": 1 }\n');
    const res = run(fixture, "--init");
    expect(res.code).toBe(1);
    expect(res.output).toContain("baseline already exists");
  });
});
