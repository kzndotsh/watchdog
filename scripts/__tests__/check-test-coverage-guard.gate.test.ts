import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const GATE = "check-test-coverage-guard.mjs";

const VITEST_CONFIG = `export default {
  test: { include: ["**/__tests__/**/*.test.ts"], exclude: ["**/node_modules/**"] },
};
`;

const testConfig = (include: string[]) =>
  JSON.stringify({
    compilerOptions: { noEmit: true, strict: true, types: [] },
    include,
  });

const PLAYWRIGHT_CONFIG = `export default { testDir: "./e2e/specs" };\n`;

const PW_SPEC =
  'import { test } from "@playwright/test";\ntest("x", () => {});\n';

const SPEC = 'import { it } from "vitest";\nit("x", () => {});\n';

function repoWith(files: Record<string, string>) {
  const repo = createGateRepo([GATE]);
  repo.write("vitest.config.ts", VITEST_CONFIG);
  for (const [rel, content] of Object.entries(files)) {
    repo.write(rel, content);
  }
  repo.commitAll("fixture");
  return repo;
}

describe("check-test-coverage-guard gate", () => {
  it("passes when every test file vitest discovers is covered by a tsconfig.test.json", () => {
    const repo = repoWith({
      "packages/a/tsconfig.test.json": testConfig(["src"]),
      "packages/a/src/__tests__/a.test.ts": SPEC,
      "packages/b/tsconfig.test.json": testConfig(["src"]),
      "packages/b/src/__tests__/b.test.ts": SPEC,
    });

    const res = repo.run(GATE);

    expect(res.code).toBe(0);
    expect(res.output).toContain("check:test-coverage-guard: ok");
  });

  it("fails a test file that sits outside every test config's include", () => {
    const repo = repoWith({
      "packages/a/tsconfig.test.json": testConfig(["src"]),
      "packages/a/src/__tests__/a.test.ts": SPEC,
      "packages/a/scripts/__tests__/gen.test.ts": SPEC,
    });

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("packages/a/scripts/__tests__/gen.test.ts");
    expect(res.output).not.toContain("packages/a/src/__tests__/a.test.ts");
    expect(res.output).toContain("tsconfig.test.json");
  });

  it("fails a test file that a test config's exclude drops", () => {
    const repo = repoWith({
      "packages/a/tsconfig.test.json": JSON.stringify({
        compilerOptions: { noEmit: true, types: [] },
        include: ["src"],
        exclude: ["src/**/__tests__/**"],
      }),
      "packages/a/src/__tests__/a.test.ts": SPEC,
    });

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("packages/a/src/__tests__/a.test.ts");
  });

  it("fails when the repo has test files but no tsconfig.test.json at all", () => {
    const repo = repoWith({ "packages/a/src/__tests__/a.test.ts": SPEC });

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("packages/a/src/__tests__/a.test.ts");
  });

  it("fails when vitest discovers no test files, instead of passing vacuously", () => {
    const repo = repoWith({
      "packages/a/tsconfig.test.json": testConfig(["src"]),
    });

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("no test files");
  });

  it("passes when a Playwright spec is covered by a tsconfig.test.json", () => {
    const repo = repoWith({
      "packages/a/tsconfig.test.json": testConfig(["src"]),
      "packages/a/src/__tests__/a.test.ts": SPEC,
      "playwright.config.ts": PLAYWRIGHT_CONFIG,
      "e2e/tsconfig.test.json": testConfig(["**/*.ts"]),
      "e2e/specs/flow.spec.ts": PW_SPEC,
    });

    const res = repo.run(GATE);

    expect(res.code).toBe(0);
    expect(res.output).toContain("check:test-coverage-guard: ok");
  });

  it("fails a Playwright spec that sits outside every test config's include", () => {
    const repo = repoWith({
      "packages/a/tsconfig.test.json": testConfig(["src"]),
      "packages/a/src/__tests__/a.test.ts": SPEC,
      "playwright.config.ts": PLAYWRIGHT_CONFIG,
      "e2e/tsconfig.test.json": testConfig(["**/*.test.ts"]),
      "e2e/specs/flow.spec.ts": PW_SPEC,
    });

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("e2e/specs/flow.spec.ts");
    expect(res.output).not.toContain("packages/a/src/__tests__/a.test.ts");
  });
});
