import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";
import type { GateRepo } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const SCRIPTS = ["check-docs-affected.mjs", "doc-map.mjs", "lib/git-range.mjs"];
const CODE = "apps/cli/src/index.ts";
const DOC = "docs/how-to/agent-cli.md";
const MARKER = "docs:allow-affect";

// Local runs must not inherit CI detection from the environment running the tests.
const LOCAL_ENV = {};

function baseRepo() {
  const repo = createGateRepo(SCRIPTS);
  repo.write(CODE, "export const v = 1;\n");
  repo.write(DOC, "# Agent CLI\n\nOne line.\n");
  repo.write("apps/cli/AGENTS.md", "# CLI\n");
  repo.commitAll("base");
  return repo;
}

/** Run the gate exactly as lefthook's commit-msg stage does: strict, message file as the argument. */
function commitMsg(repo: GateRepo, message: string) {
  const file = path.join(repo.dir, ".git", "COMMIT_MSG_FIXTURE");
  writeFileSync(file, message);
  return repo.run(
    "check-docs-affected.mjs",
    ["--strict", "--strict-only", file],
    LOCAL_ENV
  );
}

describe("docs-affect gate: commit-msg stage", () => {
  it("lets a commit through when its own message carries the marker, then checks the next commit normally", () => {
    const repo = baseRepo();

    repo.write(CODE, "export const v = 2;\n");
    repo.git("add", "-A");
    const excused = commitMsg(
      repo,
      `feat: tweak\n\n${MARKER} — refactor only, no doc impact\n`
    );
    expect(excused.code).toBe(0);
    repo.git("commit", "--quiet", "-m", "feat: tweak");

    repo.write(CODE, "export const v = 3;\n");
    repo.git("add", "-A");
    const next = commitMsg(repo, "feat: tweak again\n");
    expect(next.code).toBe(1);
    expect(next.output).toContain("cli");
  });

  it("requires a reason after the marker", () => {
    const repo = baseRepo();
    repo.write(CODE, "export const v = 2;\n");
    repo.git("add", "-A");
    expect(commitMsg(repo, `feat: x\n\n${MARKER} —\n`).code).toBe(1);
  });

  it("ignores unstaged and untracked changes", () => {
    const repo = baseRepo();
    // unstaged edit to tracked code
    repo.write(CODE, "export const v = 2;\n");
    // untracked code
    repo.write("apps/cli/src/scratch.ts", "export {};\n");
    const clean = commitMsg(repo, "chore: nothing staged\n");
    expect(clean.code).toBe(0);

    // An unstaged doc edit must not pair with staged code.
    repo.write(DOC, "# Agent CLI\n\nUnstaged doc edit.\n");
    repo.write("apps/cli/src/other.ts", "export {};\n");
    repo.git("add", "apps/cli/src/other.ts");
    const res = commitMsg(repo, "feat: staged code, unstaged doc\n");
    expect(res.code).toBe(1);
    expect(res.output).toContain("apps/cli/src/other.ts");
  });

  it("passes when a doc is substantively edited in the same staged change", () => {
    const repo = baseRepo();
    repo.write(CODE, "export const v = 2;\n");
    repo.write(DOC, "# Agent CLI\n\nOne line, now accurate.\n");
    repo.git("add", "-A");
    expect(commitMsg(repo, "feat: x\n").code).toBe(0);
  });

  it("does not count a whitespace-only doc edit as touching the doc", () => {
    const repo = baseRepo();
    repo.write(CODE, "export const v = 2;\n");
    repo.write(DOC, "# Agent CLI  \n\n\nOne   line.\n\n");
    repo.git("add", "-A");
    const res = commitMsg(repo, "feat: x\n");
    expect(res.code).toBe(1);
    expect(res.output).toContain(DOC);
  });

  it("names the changed area, candidate docs and the exact escape-hatch syntax on failure", () => {
    const repo = baseRepo();
    repo.write(CODE, "export const v = 2;\n");
    repo.git("add", "-A");
    const res = commitMsg(repo, "feat: x\n");
    expect(res.code).toBe(1);
    expect(res.output).toContain("[cli]");
    expect(res.output).toContain(CODE);
    expect(res.output).toContain("apps/cli/AGENTS.md");
    expect(res.output).toContain(DOC);
    expect(res.output).toContain("docs:allow-affect — <reason>");
  });

  it("does not demand a doc touch for web UI changes (no strict web-ui rule)", () => {
    const repo = baseRepo();
    repo.write("apps/web/src/shared/ui/chip.tsx", "export const Chip = 1;\n");
    repo.write("packages/ui/src/index.ts", "export {};\n");
    repo.git("add", "-A");
    const res = commitMsg(repo, "feat: ui tweak\n");
    expect(res.code).toBe(0);
    expect(res.output).not.toContain("web-ui");
  });

  it("still requires a doc touch for strict-rule paths such as Caps", () => {
    const repo = baseRepo();
    repo.write("packages/caps/src/registry.ts", "export const r = 1;\n");
    repo.write("packages/caps/AGENTS.md", "# Caps\n");
    repo.write("docs/reference/platform/caps-lexicon.md", "# Lexicon\n");
    repo.commitAll("base caps");
    repo.write("packages/caps/src/registry.ts", "export const r = 2;\n");
    repo.git("add", "-A");
    const res = commitMsg(repo, "feat: caps\n");
    expect(res.code).toBe(1);
    expect(res.output).toContain("[caps]");
  });

  it("fails when a doc-map rule lists the same doc twice", () => {
    const repo = baseRepo();
    repo.write(
      "scripts/doc-map.mjs",
      readFileSync(
        path.join(import.meta.dirname, "..", "doc-map.mjs"),
        "utf-8"
      ).replace(
        'docs: ["docs/how-to/agent-cli.md", "apps/cli/AGENTS.md"],',
        'docs: ["docs/how-to/agent-cli.md", "docs/how-to/agent-cli.md"],'
      )
    );
    const res = commitMsg(repo, "chore: x\n");
    expect(res.code).toBe(1);
    expect(res.output).toContain("lists docs/how-to/agent-cli.md twice");
  });
});

describe("docs-affect gate: CI push", () => {
  const ZERO = "0".repeat(40);

  /** Run the gate as the push workflow does: event payload via GITHUB_EVENT_PATH. */
  function pushRun(repo: GateRepo, before: string, after: string) {
    const payload = path.join(repo.dir, ".git", "push-event.json");
    writeFileSync(payload, JSON.stringify({ before, after }));
    return repo.run("check-docs-affected.mjs", ["--strict", "--strict-only"], {
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "push",
      GITHUB_EVENT_PATH: payload,
    });
  }

  it("fails a pushed range with unpaired code and passes when the range pairs the doc", () => {
    const repo = baseRepo();
    const before = repo.git("rev-parse", "HEAD").trim();
    repo.write(CODE, "export const v = 2;\n");
    repo.commitAll("feat: code only");
    const unpaired = repo.git("rev-parse", "HEAD").trim();

    const bad = pushRun(repo, before, unpaired);
    expect(bad.code).toBe(1);
    expect(bad.output).toContain("[cli]");

    repo.write(DOC, "# Agent CLI\n\nDocumented.\n");
    repo.commitAll("docs: pair it");
    const paired = repo.git("rev-parse", "HEAD").trim();
    expect(pushRun(repo, before, paired).code).toBe(0);
  });

  it("falls back to the merge base with main when the before SHA is all zeros", () => {
    const repo = baseRepo();
    repo.git("checkout", "--quiet", "-b", "feature");
    repo.write(CODE, "export const v = 2;\n");
    repo.commitAll("feat: code only");
    const after = repo.git("rev-parse", "HEAD").trim();
    const res = pushRun(repo, ZERO, after);
    expect(res.code).toBe(1);
    expect(res.output).toContain("[cli]");
  });

  it("fails loudly when the range cannot be resolved", () => {
    const repo = baseRepo();
    const after = repo.git("rev-parse", "HEAD").trim();
    const res = pushRun(repo, "1".repeat(40), after);
    expect(res.code).toBe(1);
    expect(res.output).toContain("not a commit in this clone");
    expect(res.output).not.toContain("no changes");
  });

  it("honours the marker in a pushed commit message", () => {
    const repo = baseRepo();
    const before = repo.git("rev-parse", "HEAD").trim();
    repo.write(CODE, "export const v = 2;\n");
    repo.commitAll(`feat: code\n\n${MARKER} — generated output`);
    const after = repo.git("rev-parse", "HEAD").trim();
    expect(pushRun(repo, before, after).code).toBe(0);
  });

  it("fails, rather than counting a doc as touched, when the doc diff cannot be read", () => {
    const repo = baseRepo();
    const before = repo.git("rev-parse", "HEAD").trim();
    repo.write(CODE, "export const v = 2;\n");
    repo.write(DOC, "# Agent CLI\n\nDocumented in the new commit.\n");
    repo.commitAll("feat: code and doc");
    const after = repo.git("rev-parse", "HEAD").trim();

    // Delete the doc's new blob: the tree diff still lists the path, but its content cannot be read.
    const blob = repo.git("rev-parse", `${after}:${DOC}`).trim();
    rmSync(
      path.join(repo.dir, ".git", "objects", blob.slice(0, 2), blob.slice(2))
    );

    const res = pushRun(repo, before, after);
    expect(res.code).toBe(1);
    expect(res.output).toContain("FAIL");
  });
});

describe("docs-affect gate: CI pull request", () => {
  it("fails loudly when the merge base with the base branch cannot be resolved", () => {
    const repo = baseRepo();
    const res = repo.run(
      "check-docs-affected.mjs",
      ["--strict", "--strict-only"],
      {
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: "pull_request",
        GITHUB_BASE_REF: "no-such-branch",
      }
    );
    expect(res.code).toBe(1);
    expect(res.output).toContain(
      "cannot resolve merge base with no-such-branch"
    );
    expect(res.output).not.toContain("check:docs-affected: no changes");
  });

  /** Run the gate as the pull_request workflow does: payload via GITHUB_EVENT_PATH. */
  function prRun(repo: GateRepo, body: string) {
    const payload = path.join(repo.dir, ".git", "pr-event.json");
    writeFileSync(payload, JSON.stringify({ pull_request: { body } }));
    return repo.run("check-docs-affected.mjs", ["--strict", "--strict-only"], {
      GITHUB_ACTIONS: "true",
      GITHUB_BASE_REF: "main",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: payload,
    });
  }

  it("fails a pull request whose range has unpaired code and no marker", () => {
    const repo = baseRepo();
    repo.git("checkout", "--quiet", "-b", "feature");
    repo.write(CODE, "export const v = 2;\n");
    repo.commitAll("feat: code only");
    const res = prRun(repo, "");
    expect(res.code).toBe(1);
    expect(res.output).toContain("[cli]");
  });

  it("honours the marker in a commit message inside the pull request range", () => {
    const repo = baseRepo();
    repo.git("checkout", "--quiet", "-b", "feature");
    repo.write(CODE, "export const v = 2;\n");
    repo.commitAll(`feat: code\n\n${MARKER} — generated output`);
    expect(prRun(repo, "").code).toBe(0);
  });

  it("honours the marker in the pull request body", () => {
    const repo = baseRepo();
    repo.git("checkout", "--quiet", "-b", "feature");
    repo.write(CODE, "export const v = 2;\n");
    repo.commitAll("feat: code only");
    expect(prRun(repo, `${MARKER} — generated output`).code).toBe(0);
  });
});
