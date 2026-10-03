import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * Policy: every hook either blocks or is deleted. These read the checked-in
 * hook config (data, not gate code) and assert no hook is wired to run a gate
 * in a mode that always exits 0.
 */
const repoRoot = path.resolve(import.meta.dirname, "../..");
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf-8");

describe("hook policy", () => {
  it("lefthook runs the docs gate through a strict script", () => {
    const lefthook = parse(read("lefthook.yml")) as {
      "pre-commit": { commands: Record<string, { run: string }> };
    };
    const pkg = JSON.parse(read("package.json")) as {
      scripts: Record<string, string>;
    };
    const run = lefthook["pre-commit"].commands.docs?.run ?? "";
    const script = /^pnpm (\S+)/.exec(run)?.[1] ?? "";
    expect(pkg.scripts[script]).toContain("check-docs.mjs");
    expect(pkg.scripts[script]).toContain("--strict");
  });

  it("no Cursor hook is registered for the retired after-edit no-op", () => {
    const hooks = JSON.parse(read(".cursor/hooks.json")) as {
      hooks: Record<string, unknown>;
    };
    expect(JSON.stringify(hooks)).not.toContain("validate-on-edit");
    expect(hooks.hooks.afterFileEdit).toBeUndefined();
  });
});
