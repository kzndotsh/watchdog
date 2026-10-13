/**
 * Committed baselines name existing files with the recorded counts, and the plugin layout
 * (one module per rule, registered in index.mjs, baselined rules wrapped in withBaseline).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  A,
  BASELINE,
  FIXTURE_CONFIG,
  repoRoot,
  baselineFixtureFactory,
  withLegacy,
} from "./helpers/oxlint-baseline-fixture.ts";
import { LINT_TIMEOUT_MS } from "./helpers/oxlint-fixture.ts";

const { fixtureWithRule } = baselineFixtureFactory();

/**
 * Baseline entries a normal lint run cannot see: `withBaseline` only checks files that
 * invoke the rule, so a deleted file, an excluded file or a disabled rule leaves its entry
 * unnoticed. This lints exactly the baselined files with the wrapper off and returns every
 * entry whose count differs from what the rule really finds there.
 */
function unmatchedEntries(root: string, config: string): string[] {
  const dir = path.join(root, "scripts/oxlint-plugin/baselines");
  const files = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".json"))
    : [];
  const problems: string[] = [];
  for (const file of files) {
    const ruleId = file.replace(/\.json$/, "");
    const entries: Record<string, number> = JSON.parse(
      readFileSync(path.join(dir, file), "utf-8")
    );
    const existing = Object.keys(entries).filter((rel) =>
      existsSync(path.join(root, rel))
    );
    for (const rel of Object.keys(entries)) {
      if (!existing.includes(rel)) {
        problems.push(`${ruleId}: ${rel} does not exist`);
      }
    }
    if (existing.length === 0) continue;
    const res = spawnSync(
      path.join(repoRoot, "node_modules/.bin/oxlint"),
      ["-c", config, "--format", "json", ...existing],
      {
        cwd: root,
        encoding: "utf-8",
        env: { ...process.env, WATCHDOG_BASELINE_OFF: "1" },
        maxBuffer: 256 * 1024 * 1024,
      }
    );
    const report: { diagnostics?: { code?: string; filename?: string }[] } =
      JSON.parse(res.stdout);
    for (const rel of existing) {
      const found = (report.diagnostics ?? []).filter(
        (d) => d.code === `watchdog(${ruleId})` && d.filename === rel
      ).length;
      if (found !== entries[rel]) {
        problems.push(
          `${ruleId}: ${rel} baselines ${entries[rel]} but the rule finds ${found}`
        );
      }
    }
  }
  return problems;
}

describe("committed baselines", { timeout: LINT_TIMEOUT_MS }, () => {
  it("name only files the rule is configured for, with exactly the recorded count", () => {
    expect(unmatchedEntries(repoRoot, "oxlint.config.ts")).toEqual([]);
  });

  it("flags entries for a missing file, a wrong count and an unconfigured rule", () => {
    const fixture = fixtureWithRule();
    fixture.write(A, withLegacy(1));
    fixture.write(BASELINE, `{ "${A}": 2, "packages/core/src/gone.ts": 1 }\n`);
    expect(unmatchedEntries(fixture.repo.dir, FIXTURE_CONFIG)).toEqual([
      "no-legacy-marker: packages/core/src/gone.ts does not exist",
      `no-legacy-marker: ${A} baselines 2 but the rule finds 1`,
    ]);
    fixture.write(BASELINE, `{ "${A}": 1 }\n`);
    expect(unmatchedEntries(fixture.repo.dir, FIXTURE_CONFIG)).toEqual([]);
    // The rule is not enabled in the base config: the entry cannot match.
    fixture.write(
      "oxlint.base.config.ts",
      readFileSync(path.join(repoRoot, "oxlint.config.ts"), "utf-8")
    );
    expect(
      unmatchedEntries(fixture.repo.dir, "oxlint.base.config.ts")
    ).toHaveLength(1);
  });
});

describe("plugin layout", { timeout: LINT_TIMEOUT_MS }, () => {
  const pluginDir = path.join(repoRoot, "scripts/oxlint-plugin");
  const index = readFileSync(path.join(pluginDir, "index.mjs"), "utf-8");
  const registered = [...index.matchAll(/^\s*"([a-z0-9-]+)":\s*\w+,?$/gm)].map(
    (m) => m[1] ?? ""
  );

  it("registers rules in index.mjs", () => {
    expect(registered.length).toBeGreaterThan(0);
  });

  it.each(registered)(
    "%s lives in its own module that exports one rule",
    (id) => {
      const file = path.join(pluginDir, "rules", `${id}.mjs`);
      expect(existsSync(file), `rules/${id}.mjs`).toBe(true);
      const exports = readFileSync(file, "utf-8").match(/^export /gm) ?? [];
      expect(exports).toHaveLength(1);
    }
  );

  it("has no rule module that index.mjs does not register", () => {
    const modules = readdirSync(path.join(pluginDir, "rules")).map((f) =>
      f.replace(/\.mjs$/, "")
    );
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect([...modules].sort(byName)).toEqual([...registered].sort(byName));
  });

  it("wraps every rule that has a baseline file in withBaseline", () => {
    const dir = path.join(pluginDir, "baselines");
    const baselined = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith(".json"))
      : [];
    for (const file of baselined) {
      const id = file.replace(/\.json$/, "");
      expect(registered, `${file} names no registered rule`).toContain(id);
      const source = readFileSync(
        path.join(pluginDir, "rules", `${id}.mjs`),
        "utf-8"
      );
      expect(
        source,
        `rules/${id}.mjs must export withBaseline("${id}", ...)`
      ).toContain(`withBaseline("${id}"`);
    }
  });
});
