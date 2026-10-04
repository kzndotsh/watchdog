import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

type Deps = Record<string, string>;

interface Fixture {
  /** Default catalog entries. */
  readonly catalog?: Deps;
  /** package.json dependencies, keyed by workspace dir ("." is the root). */
  readonly packages: Record<
    string,
    { dependencies?: Deps; devDependencies?: Deps; peerDependencies?: Deps }
  >;
}

function workspaceRepo({ catalog = {}, packages }: Fixture) {
  const repo = createGateRepo(["check-catalog.mjs"]);
  const catalogYaml = Object.entries(catalog)
    .map(([name, range]) => `  "${name}": "${range}"`)
    .join("\n");
  repo.write(
    "pnpm-workspace.yaml",
    `packages:\n  - "apps/*"\n  - "packages/*"\n\ncatalog:\n${catalogYaml}\n`
  );
  for (const [dir, manifest] of Object.entries(packages)) {
    repo.write(
      dir === "." ? "package.json" : `${dir}/package.json`,
      JSON.stringify({ name: dir, private: true, ...manifest })
    );
  }
  repo.commitAll("workspace");
  return repo;
}

describe("check-catalog", () => {
  it("passes when every shared dependency uses the catalog", () => {
    const res = workspaceRepo({
      catalog: { effect: "4.0.0", zod: "^4.6.5" },
      packages: {
        ".": { devDependencies: { effect: "catalog:" } },
        "packages/a": { dependencies: { effect: "catalog:", zod: "catalog:" } },
        "packages/b": { dependencies: { zod: "catalog:" } },
      },
    }).run("check-catalog.mjs");
    expect(res.code).toBe(0);
    expect(res.output).toContain("check:catalog: ok");
  });

  it("fails when two packages share a dependency and one uses a literal range", () => {
    const res = workspaceRepo({
      catalog: { zod: "^4.6.5" },
      packages: {
        "packages/a": { dependencies: { zod: "catalog:" } },
        "packages/b": { dependencies: { zod: "^4.6.5" } },
      },
    }).run("check-catalog.mjs");
    expect(res.code).toBe(1);
    expect(res.output).toContain("packages/b");
    expect(res.output).toContain("zod");
    expect(res.output).toContain('"^4.6.5"');
  });

  it("fails when two packages share a dependency and both use literal ranges, even equal ones", () => {
    const res = workspaceRepo({
      packages: {
        "apps/x": { devDependencies: { typescript: "7.0.2" } },
        "packages/y": { devDependencies: { typescript: "7.0.2" } },
      },
    }).run("check-catalog.mjs");
    expect(res.code).toBe(1);
    expect(res.output).toContain("apps/x");
    expect(res.output).toContain("packages/y");
  });

  it("counts the root package and mixed dependency types as sharing", () => {
    const res = workspaceRepo({
      catalog: { vitest: "^5.0.1" },
      packages: {
        ".": { devDependencies: { vitest: "^5.0.1" } },
        "packages/a": { dependencies: { vitest: "catalog:" } },
      },
    }).run("check-catalog.mjs");
    expect(res.code).toBe(1);
    expect(res.output).toContain("(root)");
  });

  it("does not count one package listing a dependency twice as sharing", () => {
    const res = workspaceRepo({
      packages: {
        "packages/a": {
          dependencies: { lodash: "^4.17.21" },
          devDependencies: { lodash: "^4.17.21" },
        },
      },
    }).run("check-catalog.mjs");
    expect(res.code).toBe(0);
  });

  it("fails when catalog: names an entry the catalog does not define", () => {
    const res = workspaceRepo({
      catalog: {},
      packages: { "packages/a": { dependencies: { effect: "catalog:" } } },
    }).run("check-catalog.mjs");
    expect(res.code).toBe(1);
    expect(res.output).toContain('no "effect" entry');
  });

  it("passes for a dependency used by one package with a literal range", () => {
    const res = workspaceRepo({
      packages: {
        "packages/a": { dependencies: { lodash: "^4.17.21" } },
        "packages/b": { dependencies: { other: "^1.0.0" } },
      },
    }).run("check-catalog.mjs");
    expect(res.code).toBe(0);
  });

  it("ignores workspace links and peer ranges", () => {
    const res = workspaceRepo({
      catalog: { react: "^19.3.0" },
      packages: {
        "packages/a": {
          dependencies: { "@watchdog/b": "workspace:*" },
          peerDependencies: { react: "^19.0.0" },
        },
        "packages/b": {
          dependencies: { "@watchdog/a": "workspace:*" },
          peerDependencies: { react: "^19.0.0" },
        },
        "apps/c": { dependencies: { react: "catalog:" } },
      },
    }).run("check-catalog.mjs");
    expect(res.code).toBe(0);
  });
});
