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
