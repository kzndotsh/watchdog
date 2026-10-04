import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const GATE = "check-workspace-reexports.mjs";

function repoWith(files: Record<string, string>) {
  const repo = createGateRepo([GATE]);
  for (const [rel, content] of Object.entries(files)) {
    repo.write(rel, content);
  }
  return repo;
}

describe("check-workspace-reexports gate", () => {
  it("passes when a package imports another package and uses it without re-exporting", () => {
    const res = repoWith({
      "packages/core/src/ok.ts": [
        'import type { DbTx } from "@watchdog/db";',
        'export { local } from "./local";',
        'export * from "./other";',
        "export const run = (tx: DbTx) => tx;",
        "",
      ].join("\n"),
    }).run(GATE);

    expect(res.code).toBe(0);
    expect(res.output).toContain("check:workspace-reexports: ok");
  });

  it("fails on a named re-export from another workspace package", () => {
    const res = repoWith({
      "packages/core/src/bad.ts":
        'export type { DbTx, DbExec } from "@watchdog/db";\n',
    }).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("packages/core/src/bad.ts");
  });

  it("fails on export-star from a workspace subpath", () => {
    const res = repoWith({
      "apps/web/src/bad.ts":
        'export * from "@watchdog/ui/components/dialog";\n',
    }).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("apps/web/src/bad.ts");
  });

  it("fails when an imported workspace symbol is exported by name", () => {
    const res = repoWith({
      "packages/core/src/bad.ts": [
        'import { titleCase, type Foo } from "@watchdog/schemas";',
        "export { titleCase };",
        "export type { Foo };",
        "",
      ].join("\n"),
    }).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("titleCase");
    expect(res.output).toContain("Foo");
  });

  it("fails when a namespace import of a workspace package is exported", () => {
    const res = repoWith({
      "packages/core/src/bad.ts": [
        'import * as db from "@watchdog/db";',
        "export { db };",
        "",
      ].join("\n"),
    }).run(GATE);

    expect(res.code).toBe(1);
  });

  it("allows the documented web wrapper layer and ignores tests", () => {
    const res = repoWith({
      "apps/web/src/shared/ui/primitives/button.tsx":
        'export * from "@watchdog/ui/components/button";\n',
      "packages/core/src/__tests__/x.test.ts":
        'export { a } from "@watchdog/db";\n',
    }).run(GATE);

    expect(res.code).toBe(0);
  });
});
