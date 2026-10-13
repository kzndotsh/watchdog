/**
 * `scripts/oxlint-baseline.mjs` hardening: a scan that did not really run never rewrites a
 * baseline, and concurrent shrinks are never overwritten with a higher count.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  A,
  BASELINE,
  CONFIG,
  FIXTURE_CONFIG,
  SCRIPT,
  read,
  repoRoot,
  stubOxlint,
  baselineFixtureFactory,
  withLegacy,
} from "./helpers/oxlint-baseline-fixture.ts";
import { LINT_TIMEOUT_MS } from "./helpers/oxlint-fixture.ts";

const { scriptFixture } = baselineFixtureFactory();

describe(
  "scripts/oxlint-baseline.mjs hardening: scans and writes",
  { timeout: LINT_TIMEOUT_MS },
  () => {
    it("runs without --config, with the rule id after the flags", () => {
      const fixture = scriptFixture();
      // The default config is the fixture config, so the script needs no --config.
      fixture.write(
        "oxlint.base.config.ts",
        readFileSync(path.join(repoRoot, "oxlint.config.ts"), "utf-8")
      );
      fixture.write(
        "oxlint.config.ts",
        CONFIG.replace("./oxlint.config.ts", "./oxlint.base.config.ts")
      );
      fixture.write(A, withLegacy(2));
      const res = fixture.repo.runFile(SCRIPT, {
        args: ["--init", "no-legacy-marker"],
      });
      expect(res.code).toBe(0);
      expect(JSON.parse(read(fixture))).toEqual({ [A]: 2 });
      expect(
        fixture.repo.runFile(SCRIPT, { args: ["no-legacy-marker"] }).code
      ).toBe(0);
    });

    const failedScans: readonly (readonly [string, string | null])[] = [
      ["oxlint cannot be spawned", null],
      ["oxlint prints JSON null", "console.log('null');"],
      ["oxlint prints no diagnostics array", "console.log('{}');"],
      [
        "a plugin crashes",
        "console.log(JSON.stringify({diagnostics:[{message:'Error running JS plugin.\\nFile path: x',code:'',filename:'x.ts'}]}));",
      ],
      [
        "a file fails to parse",
        "console.log(JSON.stringify({diagnostics:[{message:'Unexpected token',filename:'x.ts'}]}));",
      ],
    ];

    it.each(failedScans)(
      "leaves the baseline untouched when %s",
      (_name, stub) => {
        const fixture = scriptFixture();
        fixture.write(BASELINE, `{ "${A}": 2 }\n`);
        const before = read(fixture);
        stubOxlint(fixture, stub);
        const res = fixture.repo.runFile(SCRIPT, {
          args: ["no-legacy-marker", "--config", FIXTURE_CONFIG],
        });
        expect(res.code).not.toBe(0);
        expect(res.output).toContain("baseline left untouched");
        expect(read(fixture)).toBe(before);
      }
    );

    it.each(["", "not json", "{}"])(
      "refuses --init over an existing baseline file containing %j",
      (content) => {
        const fixture = scriptFixture();
        fixture.write(A, withLegacy(1));
        fixture.write(BASELINE, content);
        const res = fixture.repo.runFile(SCRIPT, {
          args: ["no-legacy-marker", "--init", "--config", FIXTURE_CONFIG],
        });
        expect(res.code).toBe(1);
        expect(res.output).toContain("baseline already exists");
        expect(read(fixture)).toBe(content);
      }
    );

    it("never writes a count higher than the baseline holds at write time", () => {
      const fixture = scriptFixture();
      fixture.write(BASELINE, `{ "${A}": 2 }\n`);
      const target = path.join(fixture.repo.dir, BASELINE);
      // The stub plays a concurrent shrink: it lowers the baseline mid-scan, then reports 2.
      stubOxlint(
        fixture,
        `require("node:fs").writeFileSync(${JSON.stringify(target)}, '{ "${A}": 1 }\\n');
const d = { message: "m", code: "watchdog(no-legacy-marker)", filename: ${JSON.stringify(A)} };
console.log(JSON.stringify({ diagnostics: [d, d] }));`
      );
      const res = fixture.repo.runFile(SCRIPT, {
        args: ["no-legacy-marker", "--config", FIXTURE_CONFIG],
      });
      expect(res.code).toBe(0);
      expect(JSON.parse(read(fixture))).toEqual({ [A]: 1 });
    });

    it("deletes the file, never writes {}, when a concurrent run already removed the only entry", () => {
      const fixture = scriptFixture();
      fixture.write(BASELINE, `{ "${A}": 1 }\n`);
      const target = path.join(fixture.repo.dir, BASELINE);
      stubOxlint(
        fixture,
        `require("node:fs").rmSync(${JSON.stringify(target)});
console.log(JSON.stringify({ diagnostics: [{ message: "m", code: "watchdog(no-legacy-marker)", filename: ${JSON.stringify(A)} }] }));`
      );
      const res = fixture.repo.runFile(SCRIPT, {
        args: ["no-legacy-marker", "--config", FIXTURE_CONFIG],
      });
      expect(res.code).toBe(0);
      expect(existsSync(target)).toBe(false);
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
