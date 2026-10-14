/**
 * Guards the job layout of `.github/workflows/ci.yml` against silent trigger loss. Integration
 * and Playwright e2e were one job; splitting it must not narrow what starts either half, Unit
 * and Gate tests share a trigger, the Web build job (production build plus bundle gate) must run
 * for every change that can break a web build, every job carries a timeout tripwire, and the
 * required `Check` aggregate must wait for every job.
 * The workflow is parsed, never matched as text.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Job = {
  readonly if?: string;
  readonly outputs?: Record<string, string>;
  readonly needs?: string | readonly string[];
  readonly "timeout-minutes"?: number;
  readonly steps?: readonly { readonly run?: string }[];
};

const WORKFLOW_PATH = path.resolve(
  import.meta.dirname,
  "../../.github/workflows/ci.yml"
);

const workflow: {
  jobs: Record<string, Job>;
  concurrency: { group: string; "cancel-in-progress": string | boolean };
} = parse(readFileSync(WORKFLOW_PATH, "utf-8"));
const { jobs } = workflow;

type FilterStep = {
  readonly id?: string;
  readonly with?: { readonly filters?: string };
};

/** The `dorny/paths-filter` filters of the `filter` step, parsed with real YAML. */
const filters = (): Record<string, unknown[]> => {
  const steps = (jobs.changes as { steps?: readonly FilterStep[] }).steps ?? [];
  const step = steps.find((candidate) => candidate.id === "filter");
  return parse(step?.with?.filters ?? "") as Record<string, unknown[]>;
};

/** A filter's patterns, with YAML-anchor nesting (`- *config_core`) flattened. */
const patterns = (name: string): string[] =>
  (filters()[name] ?? []).flat(Number.POSITIVE_INFINITY) as string[];

/** The `||`-separated terms of a job's `if:`, whitespace-normalised. */
const terms = (id: string): string[] =>
  (jobs[id]?.if ?? "")
    .split("||")
    .map((term) => term.replaceAll(/\s+/g, " ").trim())
    .filter(Boolean)
    .sort();

/** What the combined `Integration + e2e` job started on, before the split. */
const COMBINED_JOB_TERMS = [
  "github.event_name != 'pull_request'",
  ...[
    "db",
    "api",
    "caps",
    "web",
    "e2e",
    "typescript_app",
    "config_core",
    "integration_scripts",
  ].map((name) => `needs.changes.outputs.${name} == 'true'`),
].sort();

const needsOf = (id: string): string[] => {
  const needs = jobs[id]?.needs ?? [];
  return typeof needs === "string" ? [needs] : [...needs];
};

describe("ci.yml job triggers", () => {
  it("starts Integration and Playwright e2e on exactly the same condition", () => {
    expect(terms("integration")).not.toEqual([]);
    expect(terms("e2e")).toEqual(terms("integration"));
  });

  it.each(["integration", "e2e"])(
    "%s keeps every trigger the combined job had",
    (id) => {
      expect(terms(id)).toEqual(COMBINED_JOB_TERMS);
    }
  );

  it("starts Unit and Gate tests on the same condition", () => {
    expect(terms("unit")).not.toEqual([]);
    expect(terms("gate-tests")).toEqual(terms("unit"));
  });
});

describe("ci.yml Web build", () => {
  it("runs on every web, app TypeScript, root tooling or bundle-gate change, and on push", () => {
    expect(terms("web-build")).toEqual(
      [
        "github.event_name != 'pull_request'",
        ...["web", "typescript_app", "config_core", "bundle_scripts"].map(
          (name) => `needs.changes.outputs.${name} == 'true'`
        ),
      ].sort()
    );
  });

  it("is off the critical path: it waits for File detection only", () => {
    expect(needsOf("web-build")).toEqual(["changes"]);
  });

  it("builds the web app, then runs the bundle gate", () => {
    const runs = (jobs["web-build"]?.steps ?? []).map((step) => step.run ?? "");
    const build = runs.indexOf("pnpm build");
    const gate = runs.indexOf("pnpm check:bundle");
    expect(build).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(build);
  });

  it("gets its path filter from File detection", () => {
    expect(jobs.changes?.outputs).toHaveProperty("bundle_scripts");
  });
});

describe("ci.yml timeouts", () => {
  it.each(Object.keys(jobs))("%s sets a timeout-minutes tripwire", (id) => {
    const minutes = jobs[id]?.["timeout-minutes"];
    expect(minutes, `${id} has no timeout-minutes`).toBeTypeOf("number");
    // Tripwires, not the 360-minute default: a hung job must die within the half hour.
    expect(minutes).toBeLessThanOrEqual(30);
  });
});

describe("ci.yml Check aggregate", () => {
  const others = Object.keys(jobs).filter(
    (id) => id !== "check" && id !== "advisory"
  );

  it("waits for every other required job", () => {
    expect(needsOf("check").sort()).toEqual([...others].sort());
  });

  it("fails on any result of those jobs other than success or skipped", () => {
    const script =
      jobs.check?.steps?.map((step) => step.run ?? "").join("\n") ?? "";
    // `changes` is gated by the job `if:`; every other job has a `name:result` pair.
    for (const id of others.filter((job) => job !== "changes")) {
      expect(script, `${id} is missing from the result loop`).toContain(
        `"${id}:\${{ needs.${id}.result }}"`
      );
    }
    expect(script).toContain("success|skipped");
  });
});

describe("ci.yml trust rules", () => {
  it("fails Check when File detection did not succeed, instead of skipping it", () => {
    const condition = jobs.check?.if ?? "";
    // A skipped required check passes, so a failed `changes` must not skip Check.
    expect(condition).toContain("always()");
    expect(condition).not.toContain("needs.changes.result");
    const script =
      jobs.check?.steps?.map((step) => step.run ?? "").join("\n") ?? "";
    expect(script).toContain(`[ "\${{ needs.changes.result }}" != "success" ]`);
  });

  it("still skips Check for a draft pull request, whose File detection is skipped", () => {
    expect(jobs.check?.if).toContain("github.event.pull_request.draft != true");
    expect(jobs.changes?.if).toContain(
      "github.event.pull_request.draft != true"
    );
  });

  it("runs Gates on a scripts-only change", () => {
    expect(patterns("config")).toContain("scripts/**");
    expect(terms("gates")).toContain("needs.changes.outputs.config == 'true'");
  });

  it("keeps scripts-only changes out of config_core, so Integration stays off", () => {
    expect(patterns("config_core")).not.toContain("scripts/**");
  });

  it("runs the dependent jobs on a manifest edit in any workspace package", () => {
    expect(patterns("config_core")).toContain("**/package.json");
    for (const id of ["gates", "integration", "web-build"]) {
      expect(terms(id)).toContain(
        "needs.changes.outputs.config_core == 'true'"
      );
    }
    // Unit reads `config`, which includes every `config_core` pattern.
    expect(terms("unit")).toContain("needs.changes.outputs.config == 'true'");
    expect(patterns("config")).toEqual(
      expect.arrayContaining(patterns("config_core"))
    );
  });

  it("cancels in-progress runs only for pull requests, and never groups main pushes together", () => {
    const { concurrency } = workflow;
    expect(concurrency["cancel-in-progress"]).toBe(
      `\${{ github.event_name == 'pull_request' }}`
    );
    // A shared group would still replace a pending main run with a newer one.
    expect(concurrency.group).toContain("github.sha");
  });
});

describe("Node major", () => {
  it("is the same in every CI setup-node step and in the nix shell", () => {
    const majors = (file: string, pattern: RegExp): string[] => [
      ...new Set(
        [...readFileSync(file, "utf-8").matchAll(pattern)].map(
          (match) => match[1] ?? ""
        )
      ),
    ];
    const ci = majors(WORKFLOW_PATH, /node-version:\s*(\d+)/g);
    const nix = majors(
      path.resolve(import.meta.dirname, "../../flake.nix"),
      /nodejs_(\d+)/g
    );
    expect(ci).toHaveLength(1);
    expect(nix).toEqual(ci);
  });
});
