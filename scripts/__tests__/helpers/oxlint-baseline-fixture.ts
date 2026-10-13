/**
 * Shared fixture for the oxlint-baseline gate tests (`oxlint-baseline*.gate.test.ts`): a
 * throwaway repo with the real plugin plus a fixture-only rule, `no-legacy-marker` (flags the
 * identifier `legacy`), wrapped in `withBaseline`, and a copy of `scripts/oxlint-baseline.mjs`.
 */
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { findingsFor, oxlintFixtureFactory } from "./oxlint-fixture.ts";
import type { LintResult, OxlintFixture } from "./oxlint-fixture.ts";

export const RULE = "watchdog/no-legacy-marker";
export const BASELINE = "scripts/oxlint-plugin/baselines/no-legacy-marker.json";
export const FIXTURE_CONFIG = "oxlint.fixture.config.ts";
export const A = "packages/core/src/a.ts";
export const repoRoot = path.resolve(import.meta.dirname, "../../..");

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

export const CONFIG = `import base from "./oxlint.config.ts";

export default { ...base, rules: { ...base.rules, "${RULE}": "error" } };
`;

/** One violation per `legacy` identifier: `const legacy1 = 1` does not match. */
export const withLegacy = (count: number) =>
  Array.from(
    { length: count },
    (_, i) => `export const v${i} = { legacy: ${i} };\n`
  ).join("");

export const SCRIPT = "scripts/oxlint-baseline.mjs";

/**
 * Call once at the top of a test file: the factory registers per-test cleanup, so it must
 * run in the file that owns the tests.
 */
export function baselineFixtureFactory() {
  const createFixture = oxlintFixtureFactory({ lifetime: "test" });

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

  function scriptFixture(): OxlintFixture {
    const fixture = fixtureWithRule();
    fixture.repo.copyFromRepo(SCRIPT);
    return fixture;
  }

  return { fixtureWithRule, scriptFixture };
}

export const lintRule = (fixture: OxlintFixture, paths: readonly string[]) =>
  fixture.lint(paths, { config: FIXTURE_CONFIG });

export const hits = (result: LintResult, file: string) =>
  findingsFor(result, file, RULE);

export const read = (fixture: OxlintFixture) =>
  readFileSync(path.join(fixture.repo.dir, BASELINE), "utf-8");

/** Replace the symlinked node_modules with one whose `oxlint` is a stub node script. */
export function stubOxlint(fixture: OxlintFixture, body: string | null) {
  const modules = path.join(fixture.repo.dir, "node_modules");
  rmSync(modules, { force: true, recursive: true });
  if (body === null) return;
  mkdirSync(path.join(modules, ".bin"), { recursive: true });
  const bin = path.join(modules, ".bin/oxlint");
  writeFileSync(bin, `#!/usr/bin/env node\n${body}\n`);
  chmodSync(bin, 0o755);
}
