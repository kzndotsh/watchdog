/**
 * Guards the job layout of `.github/workflows/ci.yml` against silent trigger loss. Integration
 * and Playwright e2e were one job; splitting it must not narrow what starts either half, Unit
 * and Gate tests share a trigger, and the required `Check` aggregate must wait for every job.
 * The workflow is parsed, never matched as text.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Job = {
  readonly if?: string;
  readonly needs?: string | readonly string[];
  readonly steps?: readonly { readonly run?: string }[];
};

const workflow: { jobs: Record<string, Job> } = parse(
  readFileSync(
    path.resolve(import.meta.dirname, "../../.github/workflows/ci.yml"),
    "utf-8"
  )
);
const { jobs } = workflow;

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
