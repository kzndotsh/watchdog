import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const BEFORE = [
  'import { expect, it } from "vitest";',
  'it("a", () => { expect(1).toBe(1); expect(2).toBe(2); });',
  "",
].join("\n");

function repoWithBase() {
  const repo = createGateRepo(["test-diff-report.mjs"]);
  repo.write("pkg/src/__tests__/a.test.ts", BEFORE);
  repo.write(
    "pkg/src/__tests__/b.test.ts",
    'it("b", () => {\n  expect(1).toBe(1);\n  expect(2).toBe(2);\n});\n'
  );
  repo.write("pkg/src/prod.ts", "export const x = 1;\n");
  repo.commitAll("base");
  repo.git("branch", "base");
  return repo;
}

describe("test-diff-report", () => {
  it("reports added mocks, casts and sleeps and removed assertions per file", () => {
    const repo = repoWithBase();
    repo.write(
      "pkg/src/__tests__/a.test.ts",
      [
        'import { expect, it, vi } from "vitest";',
        'vi.mock("./thing", () => ({}));',
        'it("a", () => { expect(1).toBe(1); const v = 2 as never; setTimeout(() => {}, 1); });',
        "",
      ].join("\n")
    );
    repo.write(
      "pkg/src/__tests__/b.test.ts",
      'it("b", () => {\n  expect(1).toBe(1);\n});\n'
    );
    repo.write("pkg/src/prod.ts", 'vi.mock("./ignored");\n');
    repo.commitAll("head");

    const res = repo.run("test-diff-report.mjs", ["base", "HEAD"]);

    expect(res.code).toBe(0);
    expect(res.output).toContain("| vi.mock calls | 1 | 0 | +1 |");
    expect(res.output).toContain(
      "| `as never` / `as unknown as` casts | 1 | 0 | +1 |"
    );
    expect(res.output).toContain("`pkg/src/__tests__/a.test.ts`: mocks +1");
    expect(res.output).toContain(
      "`pkg/src/__tests__/b.test.ts`: assertions -1"
    );
    expect(res.output).not.toContain("prod.ts");
  });

  it("counts the removed lines of a deleted test file and ignores a deleted non-test file", () => {
    const repo = repoWithBase();
    repo.git("rm", "--quiet", "pkg/src/__tests__/b.test.ts");
    repo.git("rm", "--quiet", "pkg/src/prod.ts");
    repo.commitAll("head");

    const res = repo.run("test-diff-report.mjs", ["base", "HEAD"]);

    expect(res.code).toBe(0);
    expect(res.output).toContain("| expect( assertions | 0 | 2 | -2 |");
    expect(res.output).toContain(
      "`pkg/src/__tests__/b.test.ts`: assertions -2"
    );
  });

  it("skips quietly when git cannot run", () => {
    const repo = repoWithBase();

    const res = repo.run("test-diff-report.mjs", ["base", "HEAD"], {
      PATH: "/nonexistent",
    });

    expect(res.code).toBe(0);
    expect(res.output).toContain("Skipped");
  });

  it("says so when nothing moved", () => {
    const repo = repoWithBase();
    repo.write("pkg/src/prod.ts", "export const x = 2;\n");
    repo.commitAll("head");

    const res = repo.run("test-diff-report.mjs", ["base", "HEAD"]);

    expect(res.code).toBe(0);
    expect(res.output).toContain("No test file added a mock");
  });

  it("never fails: an unknown base is reported and skipped", () => {
    const repo = repoWithBase();

    const res = repo.run("test-diff-report.mjs", ["no-such-ref", "HEAD"]);

    expect(res.code).toBe(0);
    expect(res.output).toContain("Skipped");
  });

  it("rejects a missing base argument", () => {
    const res = repoWithBase().run("test-diff-report.mjs");

    expect(res.code).toBe(2);
    expect(res.output).toContain("usage:");
  });
});
