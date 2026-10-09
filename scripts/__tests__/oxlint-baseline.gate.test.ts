/**
 * Proves the shrink-only baseline helper (scripts/oxlint-plugin/lib/baseline.mjs) through
 * the real oxlint binary: a violation missing from the baseline fails, a baseline entry
 * that no longer occurs fails as stale, and `scripts/oxlint-baseline.mjs` writes and
 * shrinks baselines but never raises one. A fixture-only rule, `no-legacy-marker`
 * (flags the identifier `legacy`), is wrapped in `withBaseline` inside the throwaway repo;
 * no real rule is needed. Also asserts every committed baseline entry names a file that exists.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { findingsFor, oxlintFixtureFactory } from "./helpers/oxlint-fixture.ts";
import type { LintResult, OxlintFixture } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/no-legacy-marker";
const BASELINE = "scripts/oxlint-plugin/baselines/no-legacy-marker.json";
const FIXTURE_CONFIG = "oxlint.fixture.config.ts";
const repoRoot = path.resolve(import.meta.dirname, "../..");

const RULE_MODULE = `import { withBaseline } from "../lib/baseline.mjs";

export const noLegacyMarker = withBaseline("no-legacy-marker", {
  meta: { type: "problem", docs: { description: "Fixture rule." } },
  create(context) {
    return {
      Identifier(node) {
        if (node.name === "legacy") {
          context.report({ node, message: "Rename legacy (fixture rule)." });
        }
      },
    };
  },
});
`;

const INDEX = `import base from "./base.mjs";
import { noLegacyMarker } from "./rules/no-legacy-marker.mjs";

export default {
  meta: base.meta,
  rules: { ...base.rules, "no-legacy-marker": noLegacyMarker },
};
`;

const CONFIG = `import base from "./oxlint.config.ts";

export default { ...base, rules: { ...base.rules, "${RULE}": "error" } };
`;

const createFixture = oxlintFixtureFactory({ lifetime: "test" });

/** One violation per `legacy` identifier: `const legacy1 = 1` does not match. */
const withLegacy = (count: number) =>
  Array.from(
    { length: count },
    (_, i) => `export const v${i} = { legacy: ${i} };\n`
  ).join("");

function fixtureWithRule(): OxlintFixture {
  const fixture = createFixture();
  const realIndex = readFileSync(
    path.join(repoRoot, "scripts/oxlint-plugin/index.mjs"),
    "utf-8"
  );
  fixture.write("scripts/oxlint-plugin/base.mjs", realIndex);
  fixture.write("scripts/oxlint-plugin/index.mjs", INDEX);
  fixture.write(
    "scripts/oxlint-plugin/rules/no-legacy-marker.mjs",
    RULE_MODULE
  );
  fixture.write(FIXTURE_CONFIG, CONFIG);
  return fixture;
}

const lintRule = (fixture: OxlintFixture, paths: readonly string[]) =>
  fixture.lint(paths, { config: FIXTURE_CONFIG });

const hits = (result: LintResult, file: string) =>
  findingsFor(result, file, RULE);

describe("baseline helper (oxlint plugin)", () => {
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
});

describe("scripts/oxlint-baseline.mjs", () => {
  const SCRIPT = "scripts/oxlint-baseline.mjs";

  function scriptFixture(): OxlintFixture {
    const fixture = fixtureWithRule();
    fixture.repo.copyFromRepo(SCRIPT);
    return fixture;
  }

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

describe("committed baselines", () => {
  it("name only files that exist, so a deleted file cannot leave a stale entry", () => {
    const dir = path.join(repoRoot, "scripts/oxlint-plugin/baselines");
    const files = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith(".json"))
      : [];
    for (const file of files) {
      const entries: Record<string, number> = JSON.parse(
        readFileSync(path.join(dir, file), "utf-8")
      );
      for (const rel of Object.keys(entries)) {
        expect(existsSync(path.join(repoRoot, rel)), `${file}: ${rel}`).toBe(
          true
        );
      }
    }
  });
});
