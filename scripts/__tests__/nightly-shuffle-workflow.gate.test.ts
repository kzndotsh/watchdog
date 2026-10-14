/**
 * Guards `.github/workflows/nightly-shuffle.yml`, the order-dependence probe: it must stay
 * advisory (schedule or manual only, nothing required waits for it, no issues opened), keep a
 * timeout tripwire, cover every non-database Vitest project and print the seed of a failing
 * run. The workflow is parsed, never matched as text, except for the shell of its one run step.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import vitestConfig from "../../vitest.config.ts";

type Step = { readonly name?: string; readonly run?: string };
type Job = {
  readonly "timeout-minutes"?: number;
  readonly permissions?: Record<string, string>;
  readonly strategy?: { readonly matrix?: { readonly project?: string[] } };
  readonly steps?: readonly Step[];
};
type Workflow = {
  readonly on: Record<string, unknown>;
  readonly permissions?: Record<string, string>;
  readonly jobs: Record<string, Job>;
};

const workflowsDir = path.resolve(
  import.meta.dirname,
  "../../.github/workflows"
);
const read = (file: string) =>
  readFileSync(path.join(workflowsDir, file), "utf-8");

const nightlySource = read("nightly-shuffle.yml");
const nightly: Workflow = parse(nightlySource);
const ci: Workflow = parse(read("ci.yml"));

const shell = Object.values(nightly.jobs)
  .flatMap((job) => job.steps ?? [])
  .map((step) => step.run ?? "")
  .join("\n");

describe("nightly-shuffle.yml triggers", () => {
  it("runs on a schedule and by hand, never on a push or pull request", () => {
    expect(Object.keys(nightly.on).sort()).toEqual([
      "schedule",
      "workflow_dispatch",
    ]);
  });

  it("is not part of CI: Check does not wait for it and ci.yml does not name it", () => {
    const needs = ci.jobs.check as { needs?: string[] } | undefined;
    expect(needs?.needs ?? []).not.toContain("shuffle");
    expect(read("ci.yml")).not.toContain("nightly");
  });
});

describe("nightly-shuffle.yml safety", () => {
  it.each(Object.keys(nightly.jobs))(
    "%s sets a timeout-minutes tripwire of at most 30",
    (id) => {
      const minutes = nightly.jobs[id]?.["timeout-minutes"];
      expect(minutes, `${id} has no timeout-minutes`).toBeTypeOf("number");
      expect(minutes).toBeLessThanOrEqual(30);
    }
  );

  it("can only read the repository, so it can open no issue", () => {
    expect(nightly.permissions).toEqual({ contents: "read" });
    for (const job of Object.values(nightly.jobs)) {
      expect(job.permissions).toBeUndefined();
    }
    expect(shell).not.toMatch(/gh\s+(issue|api)|issues:/);
  });
});

describe("nightly-shuffle.yml coverage", () => {
  it("shuffles every Vitest project except integration", () => {
    const projects = (vitestConfig.test?.projects ?? []) as {
      test?: { name?: string };
    }[];
    const expected = projects
      .map((project) => project.test?.name)
      .filter((name) => name !== undefined && name !== "integration")
      .sort((a, b) => String(a).localeCompare(String(b)));
    const covered = Object.values(nightly.jobs).flatMap(
      (job) => job.strategy?.matrix?.project ?? []
    );
    expect(covered.sort((a, b) => a.localeCompare(b))).toEqual(expected);
  });

  it("shuffles files under several seeds, then files and tests with repeats", () => {
    expect(shell).toContain("--sequence.shuffle.files");
    expect(shell).toContain("--sequence.shuffle.tests");
    expect(shell).toContain("--sequence.seed=");
    expect(shell).toContain("--repeats=");
    expect(shell).toMatch(/seeds=.*11 4242/);
  });

  it("prints the seed and a reproduce command for a failing pass, and keeps going", () => {
    expect(shell).toContain("::error");
    expect(shell).toContain("Reproduce: pnpm exec vitest run --project");
    expect(shell).toContain("seed $seed");
    // One red run lists every failing seed: a pass sets a flag instead of exiting.
    expect(shell).toContain("failed=1");
    expect(shell).toContain('exit "$failed"');
    expect(shell).not.toMatch(/set\s+-\w*e/);
  });
});
