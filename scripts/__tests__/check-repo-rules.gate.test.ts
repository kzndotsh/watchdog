import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

// The gate resolves `../src/repos` from its own location, so keep the package layout.
const GATE = "packages/db/scripts/check-repo-rules.mjs";
const REPO_FILE = "packages/db/src/repos/thing.repo.ts";

function repoWith(method: string[]) {
  const repo = createGateRepo([]);
  repo.copyFromRepo(GATE);
  repo.write(
    REPO_FILE,
    ["export const thingRepo = {", ...method, "};", ""].join("\n")
  );
  return repo;
}

describe("check-repo-rules gate (packages/db)", () => {
  it("passes a repo whose methods take exec first and follow the rules", () => {
    const repo = repoWith([
      "  async get(exec: DbExec, id: string) {",
      "    return exec.select().from(things).where(eq(things.id, id));",
      "  },",
    ]);

    const res = repo.runFile(GATE);

    expect(res.code).toBe(0);
    expect(res.output).toContain("repo-rules: ok (1 files)");
  });

  it("fails a repo method that does not take exec first", () => {
    const repo = repoWith([
      "  async get(id: string) {",
      "    return null;",
      "  },",
    ]);

    const res = repo.runFile(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("rule 0");
    expect(res.output).toContain("thing.repo.ts:2");
  });

  it("fails a repo that throws", () => {
    const repo = repoWith([
      "  async get(exec: DbExec, id: string) {",
      "    throw new Error('nope');",
      "  },",
    ]);

    const res = repo.runFile(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("rule 3: repos must not throw");
  });

  it("fails a repo that sends a NOTIFY itself", () => {
    const repo = repoWith([
      "  async get(exec: DbExec) {",
      "    return exec.execute(sql`select pg_notify('c', 'x')`);",
      "  },",
    ]);

    const res = repo.runFile(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("rule 2");
  });

  it("fails a repo that opens a transaction", () => {
    const repo = repoWith([
      "  async get(exec: DbExec) {",
      "    return exec.transaction(async () => null);",
      "  },",
    ]);

    const res = repo.runFile(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("rule 4");
  });

  it("fails trimmedOrUndefined outside the lookup allowlist", () => {
    const repo = repoWith([
      "  async rename(exec: DbExec, name: string) {",
      "    return trimmedOrUndefined(name);",
      "  },",
    ]);

    const res = repo.runFile(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("lookup-only");
  });

  it("fails a repo that declares a local job status set literal", () => {
    const repo = repoWith([
      "  async open(exec: DbExec) {",
      '    return inArray(jobs.status, ["queued", "running"]);',
      "  },",
    ]);

    const res = repo.runFile(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("job status set literal");
    expect(res.output).toContain("@watchdog/schemas");
    expect(res.output).toContain("thing.repo.ts:3");
  });

  it("passes a repo that uses one status literal or the vocabulary sets", () => {
    const repo = repoWith([
      "  async open(exec: DbExec) {",
      '    exec.update(jobs).set({ status: "cancelled" });',
      "    return inArray(jobs.status, [...OPEN_JOB_STATUSES]);",
      "  },",
      '  async other(exec: DbExec) { return ["queued", "unrelated"]; },',
    ]);

    const res = repo.runFile(GATE);

    expect(res.code).toBe(0);
  });

  it("passes a status-looking comment trailing a code line", () => {
    const repo = repoWith([
      "  async open(exec: DbExec) {",
      '    return exec.select(); // was inArray(status, ["queued", "running"])',
      "  },",
    ]);

    expect(repo.runFile(GATE).code).toBe(0);
  });

  it("passes a status set inside block and JSDoc comments", () => {
    const repo = repoWith([
      '  /** open = ["queued", "running"] */',
      "  async open(exec: DbExec) {",
      '    /* ["queued", "running"] */',
      "    return exec.select();",
      "  },",
    ]);

    expect(repo.runFile(GATE).code).toBe(0);
  });

  it("does not mistake // inside a string for a comment", () => {
    const repo = repoWith([
      "  async open(exec: DbExec) {",
      '    return inArray(jobs.url, ["http://a", "queued", "running"]);',
      "  },",
    ]);

    const res = repo.runFile(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("job status set literal");
  });

  it("fails a status set whose array holds a nested bracket", () => {
    const repo = repoWith([
      "  async open(exec: DbExec, x: string[]) {",
      '    return inArray(jobs.status, [x[0], "queued", "running"]);',
      "  },",
    ]);

    const res = repo.runFile(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("job status set literal");
    expect(res.output).toContain("thing.repo.ts:3");
  });

  it("fails a status set written with backtick quotes", () => {
    const repo = repoWith([
      "  async open(exec: DbExec) {",
      "    return inArray(jobs.status, [`queued`, `running`]);",
      "  },",
    ]);

    const res = repo.runFile(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("job status set literal");
  });

  it("fails a status set that follows a string holding a bracket", () => {
    const repo = repoWith([
      "  async open(exec: DbExec) {",
      '    const prefix = "[";',
      '    return inArray(jobs.status, ["queued", "running"]) && prefix;',
      "  },",
    ]);

    const res = repo.runFile(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("job status set literal");
    expect(res.output).toContain("thing.repo.ts:4");
  });

  it("fails a status set passed to new Set", () => {
    const repo = repoWith([
      "  async open(exec: DbExec) {",
      '    return new Set(["queued", "running"]);',
      "  },",
    ]);

    const res = repo.runFile(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("job status set literal");
  });

  it("does not require flagging a status comparison chain", () => {
    const repo = repoWith([
      "  async open(exec: DbExec, status: string) {",
      '    return status === "queued" || status === "running";',
      "  },",
    ]);

    expect(repo.runFile(GATE).code).toBe(0);
  });
});
