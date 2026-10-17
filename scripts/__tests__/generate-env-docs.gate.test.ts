import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const repoRoot = path.resolve(import.meta.dirname, "../..");
/**
 * The schema's dependencies (zod) resolve from the real install, so the fixture repo reads the
 * real env source and keeps only the generated files of its own.
 */
const SOURCE = ["--source", path.join(repoRoot, "packages/env/src")];
const SCRIPT = "generate-env-docs.mjs";
const PRODUCTION_EXAMPLE = readFileSync(
  path.join(repoRoot, "env.production.example"),
  "utf-8"
);

function freshRepo() {
  const repo = createGateRepo([SCRIPT]);
  repo.write("env.production.example", PRODUCTION_EXAMPLE);
  repo.commitAll("fixture");
  return repo;
}

/** A repo whose generated files were just written. */
function generatedRepo() {
  const repo = freshRepo();
  expect(repo.run(SCRIPT, SOURCE).code).toBe(0);
  return repo;
}

const read = (repo: { dir: string }, rel: string) =>
  readFileSync(path.join(repo.dir, rel), "utf-8");

describe("generate-env-docs", () => {
  it("fails --check when the generated files are missing", () => {
    const res = freshRepo().run(SCRIPT, [...SOURCE, "--check"]);
    expect(res.code).toBe(1);
    expect(res.output).toContain("env.example is stale");
    expect(res.output).toContain(
      "docs/reference/platform/configuration.md is stale"
    );
  });

  it("passes --check right after generating", () => {
    const res = generatedRepo().run(SCRIPT, [...SOURCE, "--check"]);
    expect(res.output).toContain("check:env: ok");
    expect(res.code).toBe(0);
  });

  it("fails --check when env.example was edited by hand", () => {
    const repo = generatedRepo();
    repo.write(
      "env.example",
      read(repo, "env.example").replace(
        "BETTER_AUTH_SECRET=",
        "BETTER_AUTH_SECRET=change-me-to-a-long-random-string-at-least-32"
      )
    );
    const res = repo.run(SCRIPT, [...SOURCE, "--check"]);
    expect(res.code).toBe(1);
    expect(res.output).toContain("env.example is stale");
    expect(res.output).toContain("pnpm generate:env");
  });

  it("fails --check when the configuration reference was edited by hand", () => {
    const repo = generatedRepo();
    repo.write(
      "docs/reference/platform/configuration.md",
      `${read(repo, "docs/reference/platform/configuration.md")}\nhand edit\n`
    );
    const res = repo.run(SCRIPT, [...SOURCE, "--check"]);
    expect(res.code).toBe(1);
    expect(res.output).toContain("configuration.md is stale");
  });

  it("fails --check when env.production.example lists a variable nothing describes", () => {
    const repo = generatedRepo();
    repo.write(
      "env.production.example",
      `${PRODUCTION_EXAMPLE}\nNOT_A_REAL_SETTING=1\n`
    );
    const res = repo.run(SCRIPT, [...SOURCE, "--check"]);
    expect(res.code).toBe(1);
    expect(res.output).toContain("lists NOT_A_REAL_SETTING");
  });

  it("fails --check when env.production.example omits a variable the app validates", () => {
    const repo = generatedRepo();
    repo.write(
      "env.production.example",
      PRODUCTION_EXAMPLE.replace(/^#? ?S3_PUBLIC_URL=.*$/m, "")
    );
    const res = repo.run(SCRIPT, [...SOURCE, "--check"]);
    expect(res.code).toBe(1);
    expect(res.output).toContain("does not list S3_PUBLIC_URL");
  });

  it("writes every secret blank into env.example", () => {
    const text = read(generatedRepo(), "env.example");
    for (const name of [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "S3_SECRET_KEY",
      "WD_MASTER_VAULT_KEY",
    ]) {
      expect(text).toMatch(new RegExp(`^${name}=$`, "m"));
    }
    expect(text).not.toContain("change-me");
    expect(text).not.toContain("watchdog-dev-secret");
  });

  it("lists every variable with its default, requirement and entrypoint in the reference", () => {
    const text = read(
      generatedRepo(),
      "docs/reference/platform/configuration.md"
    );
    expect(text).toContain(
      "| `S3_REGION` | Region used to sign object-store requests. | `us-east-1` | no | no | web, worker |"
    );
    expect(text).toMatch(/\| `BETTER_AUTH_SECRET` \|.*\| yes \| yes \| web \|/);
    expect(text).toContain("`WD_SKIP_MIGRATIONS`");
    expect(text).toContain("`WD_API_KEY`");
  });
});
