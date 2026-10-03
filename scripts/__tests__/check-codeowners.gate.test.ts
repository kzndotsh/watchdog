import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

function repoWith(codeowners: string | null, files: Record<string, string>) {
  const repo = createGateRepo(["check-codeowners.mjs"]);
  for (const [rel, content] of Object.entries(files)) {
    repo.write(rel, content);
  }
  if (codeowners !== null) {
    repo.write(".github/CODEOWNERS", codeowners);
  }
  repo.commitAll("fixture");
  return repo;
}

const FILES = {
  "AGENTS.md": "x",
  "apps/web/AGENTS.md": "x",
  "scripts/a.mjs": "x",
  "docker/Dockerfile": "x",
  "package.json": "{}",
};

describe("check-codeowners", () => {
  it("passes when every pattern matches a tracked file and has a valid owner", () => {
    const res = repoWith(
      [
        "# default",
        "* @kzndotsh",
        "",
        "/AGENTS.md @kzndotsh",
        "**/AGENTS.md @kzndotsh @org/team",
        "/scripts/ dev@example.test",
        "/docker/ @kzndotsh",
        "/package.json @kzndotsh # trailing comment",
        "/scripts/*.mjs @kzndotsh",
      ].join("\n"),
      FILES
    ).run("check-codeowners.mjs");
    expect(res.code).toBe(0);
    expect(res.output).toContain("check:codeowners: ok");
  });

  it("fails when a pattern matches no tracked file and names the line", () => {
    const res = repoWith("/AGENTS.md @a\n/missing.json @a\n", FILES).run(
      "check-codeowners.mjs"
    );
    expect(res.code).toBe(1);
    expect(res.output).toContain(".github/CODEOWNERS:2");
    expect(res.output).toContain("/missing.json");
  });

  it("fails when a directory pattern matches no tracked file", () => {
    const res = repoWith("/nope/ @a\n", FILES).run("check-codeowners.mjs");
    expect(res.code).toBe(1);
    expect(res.output).toContain("/nope/");
  });

  it("fails when an anchored pattern only matches nested files", () => {
    const res = repoWith("/Dockerfile @a\n", FILES).run("check-codeowners.mjs");
    expect(res.code).toBe(1);
  });

  it("fails when a line has no owner", () => {
    const res = repoWith("/AGENTS.md\n", FILES).run("check-codeowners.mjs");
    expect(res.code).toBe(1);
    expect(res.output).toContain(".github/CODEOWNERS:1");
    expect(res.output).toContain("no owner");
  });

  it("fails when an owner is not @user, @org/team or an email", () => {
    const res = repoWith("/AGENTS.md kzndotsh\n", FILES).run(
      "check-codeowners.mjs"
    );
    expect(res.code).toBe(1);
    expect(res.output).toContain("kzndotsh");
    expect(res.output).toContain("owner");
  });

  it("fails when the CODEOWNERS file is missing", () => {
    const res = repoWith(null, FILES).run("check-codeowners.mjs");
    expect(res.code).toBe(1);
    expect(res.output).toContain("missing");
  });

  it("fails on an untracked file: ownership resolves against tracked files only", () => {
    const repo = repoWith("/new.txt @a\n", FILES);
    repo.write("new.txt", "x");
    const res = repo.run("check-codeowners.mjs");
    expect(res.code).toBe(1);
  });
});
