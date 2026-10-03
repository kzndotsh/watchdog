import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * Contract for spec #54: test files are part of the normal `pnpm typecheck`, which
 * pre-push and the CI gates job already run. Reads checked-in config as data, plus one
 * real tsc run on a throwaway project to prove a wrong test type exits nonzero.
 */
const repoRoot = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf-8");
const scriptsOf = (rel: string): Record<string, string> =>
  (JSON.parse(read(rel)) as { scripts?: Record<string, string> }).scripts ?? {};

/**
 * Packages whose main tsconfig already includes the tests they cover, so their
 * `typecheck` needs no second pass: tsconfig.test.json adds nothing to the main config.
 */
const MAIN_INCLUDES_TESTS = new Set([
  "apps/web",
  "packages/test-db",
  "packages/test-kit",
]);

const workspaceDirs = ["apps", "packages"].flatMap((parent) =>
  readdirSync(path.join(repoRoot, parent)).map((e) => `${parent}/${e}`)
);

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("typecheck contract gate", () => {
  it("fails when a test has a wrong type (tsc exits nonzero on the test config)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "typecheck-contract-"));
    tmpDirs.push(dir);
    mkdirSync(path.join(dir, "src"));
    writeFileSync(
      path.join(dir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { strict: true, noEmit: true, types: [] },
        include: ["src"],
        exclude: ["src/**/*.test.ts"],
      })
    );
    writeFileSync(
      path.join(dir, "tsconfig.test.json"),
      JSON.stringify({
        extends: "./tsconfig.json",
        include: ["src"],
        exclude: [],
      })
    );
    writeFileSync(path.join(dir, "src/a.ts"), "export const a: number = 1;\n");
    writeFileSync(
      path.join(dir, "src/a.test.ts"),
      'import { a } from "./a";\nexport const wrong: string = a;\n'
    );
    const tsc = path.join(repoRoot, "node_modules/.bin/tsc");

    const main = spawnSync(tsc, ["--noEmit"], { cwd: dir, encoding: "utf-8" });
    const tests = spawnSync(tsc, ["-p", "tsconfig.test.json", "--noEmit"], {
      cwd: dir,
      encoding: "utf-8",
    });

    expect(main.status).toBe(0);
    expect(tests.status).not.toBe(0);
    expect(tests.stdout).toContain("a.test.ts");
  });

  it("fails the build if a package with tsconfig.test.json has a typecheck script that skips it", () => {
    const problems: string[] = [];
    for (const dir of workspaceDirs) {
      if (!existsSync(path.join(repoRoot, dir, "tsconfig.test.json"))) {
        continue;
      }
      const { typecheck = "", "typecheck:tests": legacy } = scriptsOf(
        `${dir}/package.json`
      );
      if (legacy !== undefined) {
        problems.push(`${dir}: remove the typecheck:tests script`);
      }
      if (
        !MAIN_INCLUDES_TESTS.has(dir) &&
        !typecheck.includes("-p tsconfig.test.json")
      ) {
        problems.push(`${dir}: typecheck must also run tsconfig.test.json`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("fails if the root typecheck skips scripts/, e2e/ or the coverage guard", () => {
    const { typecheck = "" } = scriptsOf("package.json");

    expect(typecheck).toContain("pnpm -r typecheck");
    expect(typecheck).toContain("-p scripts/tsconfig.test.json");
    expect(typecheck).toContain("-p e2e/tsconfig.test.json");
    expect(typecheck).toContain("check:test-coverage-guard");
  });

  it("fails if pre-push or the CI gates job stop running pnpm typecheck", () => {
    const lefthook = parse(read("lefthook.yml")) as {
      "pre-push": { commands: { typecheck: { run: string } } };
    };
    const ci = parse(read(".github/workflows/ci.yml")) as {
      jobs: { gates: { steps: { run?: string }[] } };
    };

    expect(lefthook["pre-push"].commands.typecheck.run).toBe("pnpm typecheck");
    expect(ci.jobs.gates.steps.map((s) => s.run)).toContain("pnpm typecheck");
  });
});
