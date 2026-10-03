import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const STOP_GATE = ".cursor/hooks/stop-gate.mjs";

/** Fixture repo with a clean committed docs tree; the stop-gate runs as a CLI against it. */
function stopGateRepo() {
  const repo = createGateRepo([
    "check-docs.mjs",
    "check-agents.mjs",
    "validate-agents.mjs",
    "lib/git-range.mjs",
  ]);
  repo.copyFromRepo(STOP_GATE);
  repo.write("AGENTS.md", "# Agents\n");
  repo.write("docs/README.md", "# Docs\n\n- [Page](page.md)\n");
  repo.write("docs/page.md", "# Page\n\n[home](README.md)\n");
  repo.write(
    "docs/reference/platform/conventions.md",
    [
      "# Conventions",
      "",
      "| Rule | Scope | Stated in | Enforced by | Status |",
      "| --- | --- | --- | --- | --- |",
      "| Be kind | repo | `docs/page.md` | guidance | guidance |",
      "",
    ].join("\n")
  );
  repo.commitAll("clean docs");
  return repo;
}

const runStop = (repo: ReturnType<typeof stopGateRepo>) =>
  repo.runFile(STOP_GATE, { input: JSON.stringify({ status: "completed" }) });

describe("cursor stop-gate", () => {
  it("reports a followup_message when a dirty docs file has a broken link", () => {
    const repo = stopGateRepo();
    repo.write("docs/page.md", "# Page\n\n[gone](missing.md)\n");
    const res = runStop(repo);
    expect(res.code).toBe(0);
    const reply = JSON.parse(res.output) as { followup_message?: string };
    expect(reply.followup_message).toContain("check:docs");
    expect(reply.followup_message).toContain("broken link");
  });

  it("reports a broken anchor in a dirty docs file", () => {
    const repo = stopGateRepo();
    repo.write("docs/page.md", "# Page\n\n[gone](#nowhere)\n");
    const reply = JSON.parse(runStop(repo).output) as {
      followup_message?: string;
    };
    expect(reply.followup_message).toContain("broken anchor");
  });

  it("fails open, never blocking the agent, when its own git probe breaks, and says so on stderr", () => {
    const repo = stopGateRepo();
    repo.write("docs/page.md", "# Page\n\n[gone](missing.md)\n");
    repo.write(".git/HEAD", "garbage\n");
    const res = runStop(repo);
    expect(res.code).toBe(0);
    expect(res.output).toContain("failing open");
    expect(res.output).toContain("{}");
    expect(res.output).not.toContain("followup_message");
  });

  it("stays silent when the dirty docs are clean", () => {
    const repo = stopGateRepo();
    repo.write("docs/page.md", "# Page\n\nText.\n\n[home](README.md)\n");
    expect(JSON.parse(runStop(repo).output)).toEqual({});
  });
});

/** Fixture repo whose committed tree lints clean; callers dirty `src/a.ts` to fail. */
function lintRepo() {
  const repo = stopGateRepo();
  repo.write(
    "oxlint.config.ts",
    'export default { rules: { "no-debugger": "error" } };\n'
  );
  repo.write("src/a.ts", "export const a = 1;\n");
  repo.commitAll("clean lint fixture");
  return repo;
}

type Reply = Record<string, unknown>;

const stop = (
  repo: ReturnType<typeof stopGateRepo>,
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
const dirtyLint = (repo: ReturnType<typeof stopGateRepo>) =>
  repo.write("src/a.ts", "debugger;\nexport const a = 1;\n");

describe("stop-gate adapters: Cursor payload", () => {
  it("stays quiet on a clean tree", () => {
    expect(stop(lintRepo(), CURSOR)).toEqual({ code: 0, reply: {} });
  });

  it("answers followup_message for a lint failure on a changed file", () => {
    const repo = lintRepo();
    dirtyLint(repo);
    const { code, reply } = stop(repo, CURSOR);
    expect(code).toBe(0);
    expect(reply.decision).toBeUndefined();
    expect(String(reply.followup_message)).toContain("Lint failed");
    expect(String(reply.followup_message)).toContain("src/a.ts");
  });

  it("allows the stop when the turn was aborted or errored", () => {
    const repo = lintRepo();
    dirtyLint(repo);
    expect(stop(repo, { status: "aborted" }).reply).toEqual({});
    expect(stop(repo, { status: "error" }).reply).toEqual({});
  });

  it("allows the stop once the loop limit of 2 is reached", () => {
    const repo = lintRepo();
    dirtyLint(repo);
    expect(stop(repo, { ...CURSOR, loop_count: 1 }).reply).toHaveProperty(
      "followup_message"
    );
    expect(stop(repo, { ...CURSOR, loop_count: 2 }).reply).toEqual({});
  });
});

describe("stop-gate adapters: Claude Code payload", () => {
  it("stays quiet on a clean tree", () => {
    expect(stop(lintRepo(), CLAUDE)).toEqual({ code: 0, reply: {} });
  });

  it("answers decision block with a reason for a lint failure on a changed file", () => {
    const repo = lintRepo();
    dirtyLint(repo);
    const { code, reply } = stop(repo, CLAUDE);
    expect(code).toBe(0);
    expect(reply.decision).toBe("block");
    expect(reply.followup_message).toBeUndefined();
    expect(String(reply.reason)).toContain("Lint failed");
    expect(String(reply.reason)).toContain("src/a.ts");
  });

  it("allows the stop when stop_hook_active is set, even with a failure", () => {
    const repo = lintRepo();
    dirtyLint(repo);
    expect(stop(repo, { ...CLAUDE, stop_hook_active: true }).reply).toEqual({});
  });

  it("honors --client over payload sniffing", () => {
    const repo = lintRepo();
    dirtyLint(repo);
    expect(stop(repo, {}, ["--client=claude"]).reply).toHaveProperty(
      "decision"
    );
    expect(stop(repo, CLAUDE, ["--client=cursor"]).reply).toHaveProperty(
      "followup_message"
    );
  });

  it("treats unparseable stdin as an empty payload and still gates", () => {
    const repo = lintRepo();
    dirtyLint(repo);
    const res = repo.runFile(STOP_GATE, { input: "not json" });
    expect(res.code).toBe(0);
    expect(JSON.parse(res.output)).toHaveProperty("followup_message");
  });
});

describe("stop-gate adapters: same findings in both formats", () => {
  it("reports identical findings for the same failing fixture", () => {
    const repo = lintRepo();
    dirtyLint(repo);
    const cursor = stop(repo, CURSOR).reply.followup_message;
    const claude = stop(repo, CLAUDE).reply.reason;
    expect(typeof cursor).toBe("string");
    expect(claude).toBe(cursor);
  });
});
