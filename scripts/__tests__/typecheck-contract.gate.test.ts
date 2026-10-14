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
const scriptsOf = (rel: string): Record<string, string> => {
  const parsed: unknown = JSON.parse(read(rel));
  const scripts =
    typeof parsed === "object" && parsed !== null && "scripts" in parsed
      ? parsed.scripts
      : undefined;
  if (typeof scripts !== "object" || scripts === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(scripts).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
};

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

  it("fails if the root typecheck skips the packages, scripts/, e2e/ or the coverage guard", () => {
    const scripts = scriptsOf("package.json");
    const { typecheck = "" } = scripts;
    // The root command runs every script matching this pattern in parallel.
    const pattern = /--parallel "\/(.+)\/"/.exec(typecheck)?.[1];
    const selected = Object.keys(scripts).filter((name) =>
      new RegExp(pattern ?? "$^").test(name)
    );

    expect(selected).toContain("check:test-coverage-guard");
    const selectedCommands = selected.map((name) => scripts[name]).join("\n");
    expect(selectedCommands).toContain("pnpm -r --no-sort");
    expect(selectedCommands).toContain("-p scripts/tsconfig.test.json");
    expect(selectedCommands).toContain("-p e2e/tsconfig.test.json");
  });

  it("fails if a typecheck script runs tsc twice or has no incremental cache under node_modules/.cache", () => {
    const problems: string[] = [];
    for (const dir of [...workspaceDirs, "."]) {
      const { typecheck = "", "typecheck:scripts": s = "" } = scriptsOf(
        `${dir}/package.json`
      );
      const tsc = dir === "." ? s : typecheck;
      if ((tsc.match(/\btsc\b/g) ?? []).length > 1) {
        problems.push(
          `${dir}: typecheck runs tsc more than once (one program per package)`
        );
      }
      if (
        tsc !== "" &&
        !tsc.includes("--incremental --tsBuildInfoFile node_modules/.cache/")
      ) {
        problems.push(
          `${dir}: tsc must be --incremental with a cache under node_modules/.cache`
        );
      }
    }
    expect(problems).toEqual([]);
  });

  it("fails if the pre-push typecheck runs on docs-only pushes or skips code", () => {
    const lefthook = parse(read("lefthook.yml")) as {
      "pre-push": { commands: { typecheck: { glob?: string[] } } };
    };
    const glob = lefthook["pre-push"].commands.typecheck.glob ?? [];
    const patterns = glob.join(" ");

    expect(glob).not.toHaveLength(0);
    for (const ext of ["ts", "tsx", "mts", "cts", "mjs", "json"]) {
      expect(patterns).toContain(ext);
    }
    expect(glob).toContain("pnpm-lock.yaml");
    expect(glob).toContain("pnpm-workspace.yaml");
    for (const docOnly of ["md", "yml", "yaml", "mdx"]) {
      expect(patterns).not.toMatch(new RegExp(`[{,.]${docOnly}[},"]`));
    }
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
