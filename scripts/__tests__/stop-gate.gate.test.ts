import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const STOP_GATE = ".cursor/hooks/stop-gate.mjs";

/**
 * Stands in for `scripts/verify.mjs`: fails with the text of `verify-findings`
 * when that file exists, passes otherwise. The stop-gate only spawns verify and
 * relays its result, so the stub is the seam; verify itself has its own test.
 */
const VERIFY_STUB = [
  'import { existsSync, readFileSync } from "node:fs";',
  'if (existsSync("verify-findings")) {',
  '  console.log(readFileSync("verify-findings", "utf8"));',
  "  process.exit(1);",
  "}",
  'console.log("verify: 3 steps passed");',
  "",
].join("\n");

/** Fixture repo with a clean committed tree; the stop-gate runs as a CLI against it. */
function stopGateRepo() {
  const repo = createGateRepo(["lib/git-range.mjs"]);
  repo.copyFromRepo(STOP_GATE);
  repo.write("scripts/verify.mjs", VERIFY_STUB);
  repo.write("src/a.ts", "export const a = 1;\n");
  repo.commitAll("clean fixture");
  return repo;
}

type Repo = ReturnType<typeof stopGateRepo>;
type Reply = Record<string, unknown>;

/** Dirty the tree and make verify fail with a lint finding on it. */
const failVerify = (repo: Repo) => {
  repo.write("src/a.ts", "debugger;\nexport const a = 1;\n");
  repo.write(
    "verify-findings",
    "FAIL lint + format (changed files)\nsrc/a.ts:1:1: no-debugger\nverify: 1 failed: lint + format (changed files)\n"
  );
};

const stop = (
  repo: Repo,
  payload: Record<string, unknown>,
  args: readonly string[] = []
) => {
  const res = repo.runFile(STOP_GATE, { input: JSON.stringify(payload), args });
  return { code: res.code, reply: JSON.parse(res.output) as Reply };
};

const CURSOR = { status: "completed", loop_count: 0 };
const CLAUDE = {
  hook_event_name: "Stop",
  session_id: "s1",
  stop_hook_active: false,
};

describe("stop-gate runs pnpm verify", () => {
  it("relays verify's findings when verify fails on a dirty tree", () => {
    const repo = stopGateRepo();
    failVerify(repo);
    const { code, reply } = stop(repo, CURSOR);
    expect(code).toBe(0);
    expect(String(reply.followup_message)).toContain("`pnpm verify` failed");
    expect(String(reply.followup_message)).toContain("src/a.ts:1:1");
  });

  it("stays quiet when verify passes on a dirty tree", () => {
    const repo = stopGateRepo();
    repo.write("src/a.ts", "export const a = 2;\n");
    expect(stop(repo, CURSOR)).toEqual({ code: 0, reply: {} });
  });

  it("does not run verify on a clean tree", () => {
    const repo = stopGateRepo();
    failVerify(repo);
    repo.commitAll("committed, findings and all");
    expect(stop(repo, CURSOR)).toEqual({ code: 0, reply: {} });
  });

  it("fails open, never blocking the agent, when its own git probe breaks, and says so on stderr", () => {
    const repo = stopGateRepo();
    failVerify(repo);
    repo.write(".git/HEAD", "garbage\n");
    const res = repo.runFile(STOP_GATE, { input: JSON.stringify(CURSOR) });
    expect(res.code).toBe(0);
    expect(res.output).toContain("failing open");
    expect(res.output).toContain("{}");
    expect(res.output).not.toContain("followup_message");
  });
});

describe("stop-gate adapters: Cursor payload", () => {
  it("answers followup_message, not decision", () => {
    const repo = stopGateRepo();
    failVerify(repo);
    const { reply } = stop(repo, CURSOR);
    expect(reply.decision).toBeUndefined();
    expect(reply).toHaveProperty("followup_message");
  });

  it("allows the stop when the turn was aborted or errored", () => {
    const repo = stopGateRepo();
    failVerify(repo);
    expect(stop(repo, { status: "aborted" }).reply).toEqual({});
    expect(stop(repo, { status: "error" }).reply).toEqual({});
  });

  it("allows the stop once the loop limit of 2 is reached", () => {
    const repo = stopGateRepo();
    failVerify(repo);
    expect(stop(repo, { ...CURSOR, loop_count: 1 }).reply).toHaveProperty(
      "followup_message"
    );
    expect(stop(repo, { ...CURSOR, loop_count: 2 }).reply).toEqual({});
  });
});

describe("stop-gate adapters: Claude Code payload", () => {
  it("answers decision block with a reason", () => {
    const repo = stopGateRepo();
    failVerify(repo);
    const { code, reply } = stop(repo, CLAUDE);
    expect(code).toBe(0);
    expect(reply.decision).toBe("block");
    expect(reply.followup_message).toBeUndefined();
    expect(String(reply.reason)).toContain("src/a.ts:1:1");
  });

  it("allows the stop when stop_hook_active is set, even with a failure", () => {
    const repo = stopGateRepo();
    failVerify(repo);
    expect(stop(repo, { ...CLAUDE, stop_hook_active: true }).reply).toEqual({});
  });

  it("honors --client over payload sniffing", () => {
    const repo = stopGateRepo();
    failVerify(repo);
    expect(stop(repo, {}, ["--client=claude"]).reply).toHaveProperty(
      "decision"
    );
    expect(stop(repo, CLAUDE, ["--client=cursor"]).reply).toHaveProperty(
      "followup_message"
    );
  });

  it("treats unparseable stdin as an empty payload and still gates", () => {
    const repo = stopGateRepo();
    failVerify(repo);
    const res = repo.runFile(STOP_GATE, { input: "not json" });
    expect(res.code).toBe(0);
    expect(JSON.parse(res.output)).toHaveProperty("followup_message");
  });
});

describe("stop-gate adapters: same findings in both formats", () => {
  it("reports identical findings for the same failing fixture", () => {
    const repo = stopGateRepo();
    failVerify(repo);
    const cursor = stop(repo, CURSOR).reply.followup_message;
    const claude = stop(repo, CLAUDE).reply.reason;
    expect(typeof cursor).toBe("string");
    expect(claude).toBe(cursor);
  });
});
