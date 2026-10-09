/**
 * Proves the shrink-only baseline helper (scripts/oxlint-plugin/lib/baseline.mjs) through
 * the real oxlint binary: a violation missing from the baseline fails, a baseline entry
 * that no longer occurs fails as stale, and `scripts/oxlint-baseline.mjs` writes and
 * shrinks baselines but never raises one. A fixture-only rule, `no-legacy-marker`
 * (flags the identifier `legacy`), is wrapped in `withBaseline` inside the throwaway repo;
 * no real rule is needed. Also asserts every committed baseline entry names a file that exists.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult, OxlintFixture } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/no-legacy-marker";
const BASELINE = "scripts/oxlint-plugin/baselines/no-legacy-marker.json";
const FIXTURE_CONFIG = "oxlint.fixture.config.ts";
const A = "packages/core/src/a.ts";
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

describe("scripts/oxlint-baseline.mjs", { timeout: LINT_TIMEOUT_MS }, () => {
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

describe(
  "scripts/oxlint-baseline.mjs hardening",
  { timeout: LINT_TIMEOUT_MS },
  () => {
    const SCRIPT = "scripts/oxlint-baseline.mjs";

    function scriptFixture(): OxlintFixture {
      const fixture = fixtureWithRule();
      fixture.repo.copyFromRepo(SCRIPT);
      return fixture;
    }

    const read = (fixture: OxlintFixture) =>
      readFileSync(path.join(fixture.repo.dir, BASELINE), "utf-8");

    /** Replace the symlinked node_modules with one whose `oxlint` is a stub node script. */
    function stubOxlint(fixture: OxlintFixture, body: string | null) {
      const modules = path.join(fixture.repo.dir, "node_modules");
      rmSync(modules, { force: true, recursive: true });
      if (body === null) return;
      mkdirSync(path.join(modules, ".bin"), { recursive: true });
      const bin = path.join(modules, ".bin/oxlint");
      writeFileSync(bin, `#!/usr/bin/env node\n${body}\n`);
      chmodSync(bin, 0o755);
    }

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

    const countStub = `const fs = require("node:fs");
const path = require("node:path");
const dir = process.env.STUB_BARRIER_DIR;
fs.writeFileSync(path.join(dir, "scanned-" + process.env.STUB_ID), "");
// Barrier: both scans finish before either run reaches the write.
const wait = () => {
  if (fs.existsSync(path.join(dir, "scanned-a")) && fs.existsSync(path.join(dir, "scanned-b"))) {
    const d = { message: "m", code: "watchdog(no-legacy-marker)", filename: ${JSON.stringify(A)} };
    setTimeout(() => console.log(JSON.stringify({ diagnostics: Array(Number(process.env.STUB_COUNT)).fill(d) })), Number(process.env.STUB_DELAY_MS));
  } else setTimeout(wait, 10);
};
wait();`;

    const spawnScript = (
      fixture: OxlintFixture,
      env: Record<string, string>
    ): Promise<number | null> =>
      new Promise((resolve) => {
        const child = spawn(
          process.execPath,
          [SCRIPT, "no-legacy-marker", "--config", FIXTURE_CONFIG],
          {
            cwd: fixture.repo.dir,
            env: { ...process.env, ...env },
            stdio: "ignore",
          }
        );
        child.on("close", resolve);
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

    it.each(["abc", "-5"])(
      "falls back to the default lock timeout for %j instead of hanging",
      (value) => {
        const fixture = scriptFixture();
        fixture.write(BASELINE, `{ "${A}": 2 }\n`);
        fixture.write(A, withLegacy(1));
        fixture.write(`${BASELINE}.lock`, "");
        // A fresh lock plus a bogus timeout: the run must still give up, not spin forever.
        const res = fixture.repo.runFile(SCRIPT, {
          args: ["no-legacy-marker", "--config", FIXTURE_CONFIG],
          env: { WATCHDOG_BASELINE_LOCK_TIMEOUT_MS: value },
        });
        expect(res.code).toBe(2);
        expect(res.output).toContain("could not take");
      },
      LINT_TIMEOUT_MS
    );

    it("aborts without writing when a fresh lock is held", () => {
      const fixture = scriptFixture();
      fixture.write(BASELINE, `{ "${A}": 2 }\n`);
      fixture.write(`${BASELINE}.lock`, "");
      fixture.write(A, withLegacy(1));
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
      fixture.write(A, withLegacy(1));
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
