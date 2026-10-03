import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const SHA = "08c6903cd8c0fde910a37f88322edcfb5dd907a8";

function workflowRepo(workflow: string, file = ".github/workflows/ci.yml") {
  const repo = createGateRepo(["check-action-pins.mjs"]);
  repo.write(file, workflow);
  repo.commitAll("workflow");
  return repo;
}

function steps(...uses: string[]) {
  return `name: t\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n${uses
    .map((u) => `      - uses: ${u}\n`)
    .join("")}`;
}

describe("check-action-pins", () => {
  it("passes when every third-party action is SHA-pinned with a version comment", () => {
    const res = workflowRepo(
      steps(`actions/checkout@${SHA} # v5`, `owner/repo/sub@${SHA} # v1.2.3`)
    ).run("check-action-pins.mjs");
    expect(res.code).toBe(0);
    expect(res.output).toContain("check:action-pins: ok");
  });

  it("fails on a tag-pinned action and names file, line and action", () => {
    const res = workflowRepo(steps("actions/checkout@v5")).run(
      "check-action-pins.mjs"
    );
    expect(res.code).toBe(1);
    expect(res.output).toContain(".github/workflows/ci.yml:7");
    expect(res.output).toContain("actions/checkout@v5");
  });

  it("fails on a branch-pinned action", () => {
    const res = workflowRepo(steps("owner/repo@main")).run(
      "check-action-pins.mjs"
    );
    expect(res.code).toBe(1);
    expect(res.output).toContain("owner/repo@main");
  });

  it("fails on a short SHA", () => {
    const res = workflowRepo(steps("owner/repo@08c6903 # v1")).run(
      "check-action-pins.mjs"
    );
    expect(res.code).toBe(1);
  });

  it("fails on a SHA pin without a trailing version comment", () => {
    const res = workflowRepo(steps(`owner/repo@${SHA}`)).run(
      "check-action-pins.mjs"
    );
    expect(res.code).toBe(1);
    expect(res.output).toContain("version comment");
  });

  it("fails on an unpinned action with no ref at all", () => {
    const res = workflowRepo(steps("owner/repo")).run("check-action-pins.mjs");
    expect(res.code).toBe(1);
  });

  it("ignores local and docker actions", () => {
    const res = workflowRepo(
      steps("./.github/actions/local", "docker://alpine:3.20")
    ).run("check-action-pins.mjs");
    expect(res.code).toBe(0);
  });

  it("accepts quoted uses values and .yaml workflows", () => {
    const res = workflowRepo(
      steps(`"owner/repo@${SHA}" # v2`),
      ".github/workflows/other.yaml"
    ).run("check-action-pins.mjs");
    expect(res.code).toBe(0);
  });

  it("checks every workflow file, not only ci.yml", () => {
    const repo = workflowRepo(steps(`owner/repo@${SHA} # v1`));
    repo.write(".github/workflows/release.yml", steps("owner/other@v3"));
    repo.commitAll("second workflow");
    const res = repo.run("check-action-pins.mjs");
    expect(res.code).toBe(1);
    expect(res.output).toContain("release.yml");
  });

  it("does not flag text in run scripts or comments that merely mention uses:", () => {
    const res = workflowRepo(
      `name: t\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      # uses: owner/repo@v1\n      - run: echo "uses: owner/repo@v1"\n`
    ).run("check-action-pins.mjs");
    expect(res.code).toBe(0);
  });
});
