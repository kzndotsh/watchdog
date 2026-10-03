import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const PROBE = [
  "const ga = process.env.GITHUB_ACTIONS;",
  'console.log("GA=" + (ga === undefined ? "unset" : ga));',
  "",
].join("\n");

/** Run `fn` with env vars set on the parent, restoring them afterwards. */
function withParentEnv(vars: Record<string, string>, fn: () => void) {
  const saved = Object.fromEntries(
    Object.keys(vars).map((k) => [k, process.env[k]])
  );
  Object.assign(process.env, vars);
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      Reflect.deleteProperty(process.env, k);
      if (v !== undefined) {
        process.env[k] = v;
      }
    }
  }
}

describe("gate fixture environment", () => {
  it("does not let a gate inherit GITHUB_ACTIONS from the parent process", () => {
    const repo = createGateRepo([]);
    repo.write("scripts/probe.mjs", PROBE);
    withParentEnv({ GITHUB_ACTIONS: "true", CI: "true" }, () => {
      expect(repo.run("probe.mjs").output).toContain("GA=unset");
      expect(repo.runFile("scripts/probe.mjs").output).toContain("GA=unset");
    });
  });

  it("passes CI variables through when a test sets them explicitly", () => {
    const repo = createGateRepo([]);
    repo.write("scripts/probe.mjs", PROBE);
    expect(
      repo.run("probe.mjs", [], { GITHUB_ACTIONS: "true" }).output
    ).toContain("GA=true");
  });
});
