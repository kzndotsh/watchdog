import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const GATE = "typecheck-tests.mjs";
const CLEAN = "scripts/test-typecheck-clean.json";

/** A stand-in for `tsc -p tsconfig.test.json`: prints the given lines, exits like tsc. */
const fakeTsc = (lines: readonly string[]) =>
  [
    ...lines.map((l) => `console.log(${JSON.stringify(l)});`),
    `process.exit(${lines.length > 0 ? 2 : 0});`,
  ].join("\n");

const err = (file: string, line: number) =>
  `${file}(${line},5): error TS2353: Object literal may only specify known properties.`;

interface Pkg {
  readonly dir: string;
  readonly lines?: readonly string[];
  /** Override the whole script body (e.g. to crash without tsc output). */
  readonly body?: string;
}

function repoWith(pkgs: readonly Pkg[], clean: readonly string[] = []) {
  const repo = createGateRepo([GATE]);
  repo.write(CLEAN, JSON.stringify(clean));
  for (const pkg of pkgs) {
    repo.write(
      `${pkg.dir}/package.json`,
      JSON.stringify({
        name: `@fixture/${pkg.dir.split("/").pop()}`,
        scripts: { "typecheck:tests": "node fake-tsc.mjs" },
      })
    );
    repo.write(`${pkg.dir}/fake-tsc.mjs`, pkg.body ?? fakeTsc(pkg.lines ?? []));
  }
  repo.commitAll("fixture");
  return repo;
}

describe("typecheck-tests gate", () => {
  it("passes errors in a package that is not on the clean list and prints the per-package table", () => {
    const repo = repoWith([
      {
        dir: "packages/core",
        lines: [
          err("src/a/__tests__/a.test.ts", 3),
          err("src/a/__tests__/a.test.ts", 9),
          err("src/b/__tests__/b.test.ts", 1),
        ],
      },
      { dir: "packages/db" },
    ]);

    const res = repo.run(GATE);

    expect(res.code).toBe(0);
    expect(res.output).toMatch(/packages\/core\s+3\s+2/);
    expect(res.output).toMatch(/packages\/db\s+0\s+0/);
    expect(res.output).toMatch(/total\s+3\s+2/i);
  });

  it("fails when a package on the clean list has errors", () => {
    const repo = repoWith(
      [
        { dir: "packages/core", lines: [err("src/a/__tests__/a.test.ts", 3)] },
        { dir: "packages/db", lines: [err("src/d/__tests__/d.test.ts", 1)] },
      ],
      ["packages/core"]
    );

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("packages/core");
    expect(res.output).toContain("clean list");
    // The non-clean package's errors are reported but are not the failure.
    expect(res.output).toMatch(/packages\/db\s+1\s+1/);
  });

  it("passes a clean-list package that is at zero errors", () => {
    const repo = repoWith(
      [
        { dir: "packages/core" },
        { dir: "packages/db", lines: [err("x.ts", 1)] },
      ],
      ["packages/core"]
    );

    expect(repo.run(GATE).code).toBe(0);
  });

  it("fails a clean-list package whose script crashes without printing tsc errors", () => {
    const repo = repoWith(
      [{ dir: "packages/core", body: "process.exit(1);" }],
      ["packages/core"]
    );

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("packages/core");
  });

  it("counts a non-clean package whose script crashes as an error but does not fail", () => {
    const repo = repoWith([{ dir: "packages/core", body: "process.exit(1);" }]);

    const res = repo.run(GATE);

    expect(res.code).toBe(0);
    expect(res.output).toMatch(/packages\/core\s+1\s+1/);
  });

  it("rejects a clean-list entry that names no package with a test typecheck", () => {
    const repo = repoWith([{ dir: "packages/core" }], ["packages/typo"]);

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("packages/typo");
  });

  it("fails when no package defines a typecheck:tests script", () => {
    const repo = repoWith([]);

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("no test typecheck projects");
  });

  it("typechecks the scripts/ and e2e/ test projects with tsc and counts their errors", () => {
    const repo = repoWith([{ dir: "packages/core" }]);
    for (const dir of ["scripts", "e2e"]) {
      repo.write(
        `${dir}/tsconfig.test.json`,
        JSON.stringify({
          compilerOptions: { strict: true, noEmit: true, types: [] },
          include: ["**/*.ts"],
        })
      );
    }
    repo.write(
      "scripts/__tests__/bad.test.ts",
      "export const n: number = 'x';\n"
    );
    repo.write("e2e/ok.test.ts", "export const n: number = 1;\n");
    repo.commitAll("projects");

    const res = repo.run(GATE);

    expect(res.code).toBe(0);
    expect(res.output).toMatch(/\bscripts\s+1\s+1/);
    expect(res.output).toMatch(/\be2e\s+0\s+0/);
  });
});
