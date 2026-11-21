import { chmodSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const GATE = "verify.mjs";

const pkg = (name: string, deps: string[] = []) =>
  JSON.stringify({
    name,
    dependencies: Object.fromEntries(deps.map((d) => [d, "workspace:*"])),
  });

/** schemas <- core <- web; tools is isolated. */
function fixture() {
  const repo = createGateRepo([
    GATE,
    "changed-packages.mjs",
    "lib/git-range.mjs",
  ]);
  repo.write("package.json", '{"name":"root"}');
  repo.write("apps/web/package.json", pkg("@wd/web", ["@wd/core"]));
  repo.write(
    "packages/server/core/package.json",
    pkg("@wd/core", ["@wd/schemas"])
  );
  repo.write("packages/domain/schemas/package.json", pkg("@wd/schemas"));
  repo.write("packages/caps/tools/package.json", pkg("@wd/tools"));
  repo.write("packages/caps/tools/src/gone.ts", "export {};\n");
  repo.write("packages/caps/capabilities.gen.json", "{}\n");
  repo.write("docs/readme.md", "docs\n");
  repo.commitAll("base");
  repo.git("checkout", "--quiet", "-b", "feature");
  return repo;
}

type Repo = ReturnType<typeof fixture>;

/** The plan as `step name -> command`, from `--dry-run`. */
function plan(repo: Repo, args: string[] = []) {
  const res = repo.run(GATE, ["--dry-run", ...args]);
  expect(res.code, res.output).toBe(0);
  return new Map(
    res.output
      .trim()
      .split("\n")
      .map((line) => {
        const at = line.indexOf(": ");
        return [line.slice(0, at), line.slice(at + 2)] as const;
      })
  );
}

describe("verify (changed)", () => {
  it("tests a changed package and its dependents, and lints only the changed files", () => {
    const repo = fixture();
    repo.write("packages/domain/schemas/src/a.ts", "export {};\n");
    repo.commitAll("schemas");

    const steps = plan(repo);

    expect(steps.get("lint + format (changed files)")).toMatch(
      / packages\/schemas\/src\/a\.ts$/
    );
    expect(steps.get("tests (affected)")).toBe(
      "pnpm exec vitest run --passWithNoTests --project unit --project web-unit --project property apps/web packages/server/core packages/domain/schemas"
    );
    expect(steps.get("typecheck")).toBe("pnpm run --silent typecheck");
    expect(steps.get("check:boundaries")).toBe(
      "pnpm run --silent check:boundaries"
    );
    expect(steps.get("validate:agents")).toMatch(/--range=[0-9a-f]{40}$/);
    expect(steps.has("knip")).toBe(false);
  });

  it("includes uncommitted and untracked files, and never lints a deleted one", () => {
    const repo = fixture();
    repo.write("packages/caps/tools/src/new.ts", "export {};\n");
    repo.git("rm", "--quiet", "packages/caps/tools/src/gone.ts");

    const steps = plan(repo);

    expect(steps.get("lint + format (changed files)")).toMatch(
      / packages\/tools\/src\/new\.ts$/
    );
    expect(steps.get("tests (affected)")).toMatch(/ packages\/tools$/);
  });

  it("runs no tests for a docs-only change, but still the gates and typecheck", () => {
    const repo = fixture();
    repo.write("docs/readme.md", "changed\n");

    const steps = plan(repo);

    expect(steps.has("tests (affected)")).toBe(false);
    expect(steps.get("check:docs:strict")).toBeDefined();
    expect(steps.get("typecheck")).toBeDefined();
  });

  it.each([
    "scripts/check-size-budget.mjs",
    ".cursor/hooks/stop-gate.mjs",
    ".github/workflows/ci.yml",
    "lefthook.yml",
  ])("adds the gate tests when %s changes", (file) => {
    const repo = fixture();
    repo.write(file, "changed\n");

    expect(plan(repo).get("tests (affected)")).toBe(
      "pnpm exec vitest run --passWithNoTests --project unit --project web-unit --project property --project gate scripts/__tests__/"
    );
  });

  it("adds the e2e parser tests when e2e/ changes", () => {
    const repo = fixture();
    repo.write("e2e/lib/parse.ts", "export {};\n");

    expect(plan(repo).get("tests (affected)")).toMatch(
      /--project e2e-parser e2e\/$/
    );
  });

  it("fails when the base ref cannot be resolved", () => {
    const repo = fixture();

    const res = repo.run(GATE, ["--dry-run", "--base", "no-such-ref"]);

    expect(res.code).toBe(1);
    expect(res.output).toContain("verify:");
  });
});

describe("verify --full", () => {
  it("runs the whole-repo forms, the CI-only gates, drift, typecheck and every test", () => {
    const repo = fixture();

    const steps = plan(repo, ["--full"]);

    expect(steps.get("lint + format")).toBe("pnpm run --silent check");
    for (const name of ["check:licenses", "check:notices", "knip"]) {
      expect(steps.get(name)).toBe(`pnpm run --silent ${name}`);
    }
    expect(steps.get("generate:caps drift")).toBe(
      "pnpm run --silent generate:caps"
    );
    expect(steps.get("test")).toBe("pnpm run --silent test");
    expect(steps.has("tests (affected)")).toBe(false);
  });

  it("treats an all-zero --base (a new branch's push) as no base", () => {
    const repo = fixture();

    const steps = plan(repo, ["--full", "--base", "0".repeat(40)]);

    expect(steps.get("validate:agents")).toMatch(/--range=[0-9a-f]{40}$/);
    expect(steps.get("validate:agents")).not.toContain("0".repeat(40));
  });
});

/**
 * A fake `pnpm` on PATH: fails the call whose arguments contain `$FAKE_FAIL`,
 * and appends to the generated caps file when `$FAKE_DRIFT` is set.
 */
const FAKE_PNPM = `#!/bin/sh
if [ -n "$FAKE_FAIL" ]; then
  case "$*" in *"$FAKE_FAIL"*) echo "boom: $*"; exit 1 ;; esac
fi
case "$*" in *generate:caps*)
  [ -n "$FAKE_DRIFT" ] && echo drift >> packages/caps/capabilities.gen.json ;;
esac
exit 0
`;

function runWithFakePnpm(
  repo: Repo,
  args: string[],
  env: Record<string, string>
) {
  repo.write(".git/fake-bin/pnpm", FAKE_PNPM);
  chmodSync(path.join(repo.dir, ".git/fake-bin/pnpm"), 0o755);
  return repo.run(GATE, args, {
    PATH: `${path.join(repo.dir, ".git/fake-bin")}:${process.env.PATH ?? ""}`,
    ...env,
  });
}

describe("verify execution", () => {
  it("passes when every step passes", () => {
    const repo = fixture();
    repo.write("packages/caps/tools/src/a.ts", "export {};\n");

    const res = runWithFakePnpm(repo, [], {});

    expect(res.code, res.output).toBe(0);
    expect(res.output).toContain("steps passed");
  });

  it("runs every step after a failure, prints the failure, and exits 1", () => {
    const repo = fixture();
    repo.write("packages/caps/tools/src/a.ts", "export {};\n");

    const res = runWithFakePnpm(repo, [], { FAKE_FAIL: "check:size" });

    expect(res.code).toBe(1);
    expect(res.output).toContain("FAIL check:size");
    expect(res.output).toContain("boom: run --silent check:size");
    expect(res.output).toMatch(/ok {3}typecheck/);
    expect(res.output).toMatch(/ok {3}tests \(affected\)/);
    expect(res.output).toContain("verify: 1 failed: check:size");
  });

  it("fails a drift step whose generator changes a committed file", () => {
    const repo = fixture();

    const res = runWithFakePnpm(repo, ["--full"], { FAKE_DRIFT: "1" });

    expect(res.code).toBe(1);
    expect(res.output).toContain("FAIL generate:caps drift");
    expect(res.output).toContain(
      "Generated output changed: packages/caps/capabilities.gen.json"
    );
  });
});
