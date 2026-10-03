import { existsSync, readFileSync } from "node:fs";
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

  describe("Claude Code project settings", () => {
    const settings = JSON.parse(read(".claude/settings.json")) as {
      attribution?: { commit?: string; pr?: string };
      hooks?: Record<
        string,
        { hooks: { type: string; command: string; timeout: number }[] }[]
      >;
      [key: string]: unknown;
    };

    it("keeps commit and PR attribution off", () => {
      expect(settings.attribution?.commit).toBe("");
      expect(settings.attribution?.pr).toBe("");
    });

    it("registers only the Stop hook, through the node runner and the shared gate", () => {
      expect(Object.keys(settings).sort()).toEqual(["attribution", "hooks"]);
      expect(Object.keys(settings.hooks ?? {})).toEqual(["Stop"]);
      const handlers = settings.hooks?.Stop?.flatMap((g) => g.hooks) ?? [];
      expect(handlers).toHaveLength(1);
      const [handler] = handlers;
      expect(handler?.type).toBe("command");
      const cursorHandler = (
        JSON.parse(read(".cursor/hooks.json")) as {
          hooks: { stop: { timeout: number }[] };
        }
      ).hooks.stop[0];
      expect(handler?.timeout).toBe(cursorHandler?.timeout);
      const paths = (handler?.command ?? "")
        .replaceAll('"', "")
        .split(" ")
        .filter((part) => part.startsWith("$CLAUDE_PROJECT_DIR/"))
        .map((part) => part.replace("$CLAUDE_PROJECT_DIR/", ""));
      expect(paths).toEqual([
        ".cursor/hooks/run-node.sh",
        ".cursor/hooks/stop-gate.mjs",
      ]);
      for (const rel of paths) {
        expect(existsSync(path.join(repoRoot, rel))).toBe(true);
      }
      expect(handler?.command).toContain("--client=claude");
    });
  });
});
