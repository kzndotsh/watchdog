import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const GATE = "changed-packages.mjs";

const pkg = (name: string, deps: string[] = []) =>
  JSON.stringify({
    name,
    dependencies: Object.fromEntries(deps.map((d) => [d, "workspace:*"])),
  });

/** schemas <- core <- api <- web; cli depends on schemas only; tools is isolated. */
function fixture() {
  const repo = createGateRepo([GATE, "lib/git-range.mjs"]);
  repo.write("package.json", '{"name":"root"}');
  repo.write("apps/web/package.json", pkg("@wd/web", ["@wd/api"]));
  repo.write("apps/cli/package.json", pkg("@wd/cli", ["@wd/schemas"]));
  repo.write("packages/api/package.json", pkg("@wd/api", ["@wd/core"]));
  repo.write("packages/core/package.json", pkg("@wd/core", ["@wd/schemas"]));
  repo.write("packages/schemas/package.json", pkg("@wd/schemas"));
  repo.write("packages/tools/package.json", pkg("@wd/tools"));
  repo.write("docs/readme.md", "docs\n");
  repo.commitAll("base");
  repo.git("checkout", "--quiet", "-b", "feature");
  return repo;
}

const names = (out: string) => out.trim().split("\n").filter(Boolean).sort();

describe("changed-packages", () => {
  it("selects a leaf package and every dependent", () => {
    const repo = fixture();
    repo.write("packages/schemas/src/a.ts", "export {};\n");
    repo.commitAll("change schemas");

    const res = repo.run(GATE);

    expect(res.code).toBe(0);
    expect(names(res.output)).toEqual([
      "@wd/api",
      "@wd/cli",
      "@wd/core",
      "@wd/schemas",
      "@wd/web",
    ]);
  });

  it("does not select dependencies or unrelated packages", () => {
    const repo = fixture();
    repo.write("packages/api/src/a.ts", "export {};\n");
    repo.commitAll("change api");

    expect(names(repo.run(GATE).output)).toEqual(["@wd/api", "@wd/web"]);
  });

  it("includes uncommitted and untracked changes", () => {
    const repo = fixture();
    repo.write("packages/tools/src/new.ts", "export {};\n");

    expect(names(repo.run(GATE).output)).toEqual(["@wd/tools"]);
  });

  it("selects nothing for a docs-only change", () => {
    const repo = fixture();
    repo.write("docs/readme.md", "changed\n");
    repo.commitAll("docs");

    const res = repo.run(GATE);

    expect(res.code).toBe(0);
    expect(names(res.output)).toEqual([]);
  });

  it.each([
    "tsconfig.base.json",
    "pnpm-workspace.yaml",
    "pnpm-lock.yaml",
    "package.json",
    "vitest.config.ts",
    "oxlint.config.ts",
  ])("selects every package when root config %s changes", (file) => {
    const repo = fixture();
    repo.write(file, "changed\n");
    repo.commitAll("root config");

    expect(names(repo.run(GATE).output)).toHaveLength(6);
  });

  it("prints JSON with --json", () => {
    const repo = fixture();
    repo.write("packages/tools/src/a.ts", "export {};\n");
    repo.commitAll("tools");

    const res = repo.run(GATE, ["--json"]);

    expect(JSON.parse(res.output)).toEqual([
      { name: "@wd/tools", dir: "packages/tools" },
    ]);
  });

  it("fails when the base ref cannot be resolved", () => {
    const repo = fixture();

    const res = repo.run(GATE, ["--base", "no-such-ref"]);

    expect(res.code).toBe(1);
    expect(res.output).toContain("changed:");
  });
});
