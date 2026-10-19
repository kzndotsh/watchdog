/**
 * Guards the job layout of `.github/workflows/ci.yml` against silent trigger loss. Integration
 * and Playwright e2e were one job; splitting it must not narrow what starts either half, the
 * unit-component job and Gate tests share a trigger, that job's name says every tier it runs
 * (it was "Unit" while it also ran web-unit, property and component), the Web build job (production build plus bundle gate) must run
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

type Step = {
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Record<string, unknown>;
};

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const DOCKERFILE = readFileSync(path.join(REPO_ROOT, "Dockerfile"), "utf-8");
const containerJob: {
  readonly permissions?: unknown;
  readonly steps: readonly Step[];
} = parse(readFileSync(WORKFLOW_PATH, "utf-8")).jobs.container;

/** The steps of the Container job that `uses` an action, by the action's name. */
const stepsUsing = (action: string): Step[] =>
  containerJob.steps.filter((step) => step.uses?.startsWith(`${action}@`));

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

/** The job that runs the unit, web-unit, property, component, component-compiled and e2e-parser projects (`test:coverage`). */
const UNIT_JOB = "unit-component";

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

  it("starts the unit-component job and Gate tests on the same condition", () => {
    expect(terms(UNIT_JOB)).not.toEqual([]);
    expect(terms("gate-tests")).toEqual(terms(UNIT_JOB));
  });
});

describe("ci.yml unit-component job name", () => {
  const job = jobs[UNIT_JOB] as Job & { readonly name?: string };
  const command = (job.steps ?? [])
    .map((step) => step.run ?? "")
    .find((run) => run.includes("test:coverage"));
  // Each Vitest project the job runs, and the word its name must carry for that tier.
  const TIER_WORDS: Record<string, string> = {
    unit: "unit",
    "web-unit": "unit",
    property: "property",
    component: "component",
    // The same tier as `component`, with React Compiler on.
    "component-compiled": "component",
    // The harness parser tests: small, node-only, ~0.2 s. No tier word in the job name.
    "e2e-parser": "",
  };

  it("runs exactly the projects that test:coverage lists", () => {
    const pkg: { scripts: Record<string, string> } = JSON.parse(
      readFileSync(
        path.resolve(WORKFLOW_PATH, "../../../package.json"),
        "utf-8"
      )
    );
    expect(command).toBeDefined();
    const projects = [
      ...(pkg.scripts["test:coverage"] ?? "").matchAll(/--project (\S+)/g),
    ].map((match) => match[1] ?? "");
    expect(projects.sort()).toEqual(Object.keys(TIER_WORDS).sort());
  });

  it("runs every local pnpm test project in one vitest invocation, so one failure never hides the rest", () => {
    const pkg: { scripts: Record<string, string> } = JSON.parse(
      readFileSync(
        path.resolve(WORKFLOW_PATH, "../../../package.json"),
        "utf-8"
      )
    );
    const script = pkg.scripts.test ?? "";
    // `a && b` stops at the first failing project; one vitest run reports all of them.
    expect(script).not.toContain("&&");
    expect(script.startsWith("vitest run ")).toBe(true);
    const projects = [...script.matchAll(/--project (\S+)/g)].map(
      (match) => match[1] ?? ""
    );
    expect(projects.sort()).toEqual(
      ["e2e-parser", "gate", "property", "unit", "web-unit"].sort()
    );
    expect(pkg.scripts["test:e2e-parser"]).toContain("--project e2e-parser");
  });

  it("names every tier it runs, so nobody mistakes component tests for unit tests", () => {
    const name = (job.name ?? "").toLowerCase();
    for (const word of new Set(Object.values(TIER_WORDS).filter(Boolean))) {
      expect(name, `job name "${job.name}" omits ${word}`).toContain(word);
    }
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

  it("runs the DESIGN.md linter and token gate in Gates, and a DESIGN.md-only change starts Gates", () => {
    const runs = jobs.gates?.steps?.map((step) => step.run ?? "") ?? [];
    expect(runs).toContain("pnpm lint:design");
    expect(runs).toContain("pnpm check:design-tokens");
    expect(patterns("design")).toContain("DESIGN.md");
    expect(terms("gates")).toContain("needs.changes.outputs.design == 'true'");
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
    // The unit-component job reads `config`, which includes every `config_core` pattern.
    expect(terms(UNIT_JOB)).toContain("needs.changes.outputs.config == 'true'");
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

  it("is the major of the Dockerfile's base image", () => {
    const ci = [
      ...readFileSync(WORKFLOW_PATH, "utf-8").matchAll(
        /node-version:\s*(\d+)/g
      ),
    ].map((match) => match[1]);
    const docker = [
      ...DOCKERFILE.matchAll(/^FROM node:(\d+)[\w.-]*@sha256:[0-9a-f]{64}/gm),
    ].map((match) => match[1]);
    expect(docker).toHaveLength(1);
    expect(docker[0]).toBe(ci[0]);
  });
});

describe("ci.yml Container image job", () => {
  it("runs on image, web, worker, package and root tooling changes, and on push", () => {
    expect(terms("container")).toEqual(
      [
        "github.event_name != 'pull_request'",
        ...["container", "config_core"].map(
          (name) => `needs.changes.outputs.${name} == 'true'`
        ),
      ].sort()
    );
  });

  it("covers everything the images are built from in its path filter", () => {
    expect(jobs.changes?.outputs).toHaveProperty("container");
    expect(patterns("container")).toEqual(
      expect.arrayContaining([
        "Dockerfile",
        ".dockerignore",
        ".trivyignore",
        "docker/**",
        "docker-compose.prod.yml",
        "scripts/s3-init.sh",
        "apps/web/**",
        "apps/worker/**",
        "packages/**",
      ])
    );
    // The lockfile and manifests arrive through config_core, which the job also reads.
    expect(patterns("config_core")).toEqual(
      expect.arrayContaining(["pnpm-lock.yaml", "**/package.json"])
    );
  });

  it("waits for File detection only and keeps the read-only default token", () => {
    expect(needsOf("container")).toEqual(["changes"]);
    expect(containerJob.permissions).toBeUndefined();
  });

  it("builds the web and worker targets with the GitHub Actions layer cache, never pushing", () => {
    const builds = stepsUsing("docker/build-push-action");
    expect(builds.map((step) => step.with?.target)).toEqual(["web", "worker"]);
    for (const step of builds) {
      expect(step.with?.load).toBe(true);
      expect(step.with?.push).toBeUndefined();
      expect(String(step.with?.["cache-from"])).toContain("type=gha");
      expect(String(step.with?.["cache-to"])).toContain("type=gha");
    }
  });

  it("scans both images with Trivy, failing on high and critical with the reviewed ignore file", () => {
    const scans = stepsUsing("aquasecurity/trivy-action");
    expect(scans.map((step) => step.with?.["image-ref"])).toEqual([
      "watchdog-web:ci",
      "watchdog-worker:ci",
    ]);
    for (const step of scans) {
      expect(step.with?.severity).toBe("HIGH,CRITICAL");
      expect(step.with?.["exit-code"]).toBe("1");
      expect(step.with?.trivyignores).toBe(".trivyignore");
      expect(step.with?.version).toMatch(/^v\d+\.\d+\.\d+$/);
    }
  });

  it("builds, then scans, then runs the smoke script", () => {
    const builds = (step: Step) =>
      step.uses?.startsWith("docker/build-push-action@") ?? false;
    const scans = (step: Step) =>
      step.uses?.startsWith("aquasecurity/trivy-action@") ?? false;
    const indexes = (match: (step: Step) => boolean) =>
      containerJob.steps.flatMap((step, index) => (match(step) ? [index] : []));
    const firstScan = Math.min(...indexes(scans));
    const lastScan = Math.max(...indexes(scans));
    const lastBuild = Math.max(...indexes(builds));
    const smoke = containerJob.steps.findIndex(
      (step) => step.run === "bash docker/smoke.sh"
    );
    expect(smoke).toBeGreaterThan(-1);
    // Every scan comes after every build, and the smoke test after every scan.
    expect(firstScan).toBeGreaterThan(lastBuild);
    expect(smoke).toBeGreaterThan(lastScan);
  });
});

describe("container image inputs", () => {
  const entries = (file: string): string[] =>
    readFileSync(path.join(REPO_ROOT, file), "utf-8").split("\n");

  it("pins every external base image by digest", () => {
    const external = [...DOCKERFILE.matchAll(/^FROM (\S+)(?: AS \S+)?$/gm)]
      .map((match) => match[1] ?? "")
      // Stages built on an earlier stage of the same file are not external.
      .filter(
        (image) => !new RegExp(`^FROM \\S+ AS ${image}$`, "m").test(DOCKERFILE)
      );
    expect(external.length).toBeGreaterThan(0);
    for (const image of external) {
      expect(image, `${image} is not pinned by digest`).toMatch(
        /@sha256:[0-9a-f]{64}$/
      );
    }
  });

  it("pins every image in the production compose file by digest", () => {
    const images = entries("docker-compose.prod.yml")
      .map((line) => /^\s+image:\s+(\S+)/.exec(line)?.[1] ?? "")
      // Our own images are named by variable and built from the Dockerfile.
      .filter((image) => image !== "" && !image.startsWith("${"));
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(image, `${image} is not pinned by digest`).toMatch(
        /@sha256:[0-9a-f]{64}$/
      );
    }
  });

  it("gives every .trivyignore entry a reason comment on the line above", () => {
    const lines = entries(".trivyignore");
    for (const [index, line] of lines.entries()) {
      if (line.trim() === "" || line.startsWith("#")) continue;
      expect(
        lines[index - 1]?.startsWith("#"),
        `.trivyignore line ${index + 1} (${line}) has no reason comment above it`
      ).toBe(true);
    }
  });
});
