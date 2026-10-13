/**
 * The shrink-only baseline helper (scripts/oxlint-plugin/lib/baseline.mjs) through the real
 * oxlint binary: a violation missing from the baseline fails, a stale entry fails.
 */

import { describe, expect, it } from "vitest";

import {
  BASELINE,
  hits,
  lintRule,
  baselineFixtureFactory,
  withLegacy,
} from "./helpers/oxlint-baseline-fixture.ts";
import { LINT_TIMEOUT_MS } from "./helpers/oxlint-fixture.ts";

const { fixtureWithRule } = baselineFixtureFactory();

describe(
  "baseline helper (oxlint plugin)",
  { timeout: LINT_TIMEOUT_MS },
  () => {
    it("fails a violation when no baseline exists", () => {
      const fixture = fixtureWithRule();
      fixture.write("packages/core/src/a.ts", withLegacy(1));
      const result = lintRule(fixture, ["packages/core/src"]);
      const [hit] = hits(result, "packages/core/src/a.ts");
      expect(result.code).not.toBe(0);
      expect(hit?.message).toContain("Rename legacy (fixture rule).");
      expect(hit?.message).toContain("new violation");
      expect(hit?.message).toContain(BASELINE);
      expect(hit?.line).toBe(1);
    });

    it("passes baselined violations", () => {
      const fixture = fixtureWithRule();
      fixture.write("packages/core/src/a.ts", withLegacy(2));
      fixture.write(BASELINE, '{ "packages/core/src/a.ts": 2 }\n');
      const result = lintRule(fixture, ["packages/core/src"]);
      expect(hits(result, "packages/core/src/a.ts")).toHaveLength(0);
    });

    it("fails only the violations beyond the baselined count", () => {
      const fixture = fixtureWithRule();
      fixture.write("packages/core/src/a.ts", withLegacy(3));
      fixture.write(BASELINE, '{ "packages/core/src/a.ts": 2 }\n');
      const found = hits(
        lintRule(fixture, ["packages/core/src"]),
        "packages/core/src/a.ts"
      );
      expect(found).toHaveLength(1);
      expect(found[0]?.line).toBe(3);
      expect(found[0]?.message).toContain("allows 2");
    });

    it("fails a new violation in a file the baseline does not list", () => {
      const fixture = fixtureWithRule();
      fixture.write("packages/core/src/a.ts", withLegacy(1));
      fixture.write("packages/core/src/b.ts", withLegacy(1));
      fixture.write(BASELINE, '{ "packages/core/src/a.ts": 1 }\n');
      const result = lintRule(fixture, ["packages/core/src"]);
      expect(hits(result, "packages/core/src/a.ts")).toHaveLength(0);
      expect(hits(result, "packages/core/src/b.ts")).toHaveLength(1);
    });

    it("fails a stale entry whose file has fewer violations than allowed", () => {
      const fixture = fixtureWithRule();
      fixture.write("packages/core/src/a.ts", withLegacy(1));
      fixture.write(BASELINE, '{ "packages/core/src/a.ts": 3 }\n');
      const result = lintRule(fixture, ["packages/core/src"]);
      const [hit] = hits(result, "packages/core/src/a.ts");
      expect(result.code).not.toBe(0);
      expect(hit?.message).toContain("Stale baseline entry");
      expect(hit?.message).toContain("allows 3");
      expect(hit?.message).toContain("only 1 remain");
    });

    it("fails a stale entry whose file no longer has any violation", () => {
      const fixture = fixtureWithRule();
      fixture.write("packages/core/src/a.ts", "export const clean = 1;\n");
      fixture.write(BASELINE, '{ "packages/core/src/a.ts": 1 }\n');
      const result = lintRule(fixture, ["packages/core/src"]);
      const [hit] = hits(result, "packages/core/src/a.ts");
      expect(result.code).not.toBe(0);
      expect(hit?.message).toContain("Stale baseline entry");
      expect(hit?.message).toContain("only 0 remain");
    });
  }
);
