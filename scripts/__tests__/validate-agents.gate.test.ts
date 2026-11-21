import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

function ownedSkill(extraFrontmatter = "", body = "# Owned demo\n") {
  return `---
name: owned-demo
description: House skill. Use when testing the gate.
${extraFrontmatter}metadata:
  owner: watchdog
  sources: AGENTS.md
---

${body}`;
}

function ownedRepo(skillMd: string) {
  const repo = createGateRepo(["validate-agents.mjs", "lib/git-range.mjs"]);
  repo.write("AGENTS.md", "# Fixture\n");
  repo.write(".agents/skills/owned-demo/SKILL.md", skillMd);
  repo.commitAll("add owned skill");
  return repo;
}

describe("validate-agents gate", () => {
  describe("owned skills", () => {
    it("passes an owned skill that uses Claude Code frontmatter keys", () => {
      const repo = ownedRepo(
        ownedSkill('disable-model-invocation: true\nargument-hint: "[x]"\n')
      );

      const result = repo.run("validate-agents.mjs");

      expect(result.output).not.toContain("FAIL");
      expect(result.code).toBe(0);
    });

    it("fails an owned skill without owner and sources metadata", () => {
      const repo = ownedRepo(
        "---\nname: owned-demo\ndescription: House skill. Use when testing.\n---\n\n# Owned\n"
      );

      const result = repo.run("validate-agents.mjs");

      expect(result.code).toBe(1);
      expect(result.output).toContain("metadata.owner");
    });

    it("warns on an owned skill description without a trigger clause", () => {
      const repo = ownedRepo(
        ownedSkill().replace("Use when testing the gate.", "Nothing more.")
      );

      const result = repo.run("validate-agents.mjs");

      expect(result.code).toBe(0);
      expect(result.output).toContain("trigger clause");
    });

    it("warns above 400 lines but still passes", () => {
      const repo = ownedRepo(ownedSkill("", "line\n".repeat(401)));

      const result = repo.run("validate-agents.mjs");

      expect(result.code).toBe(0);
      expect(result.output).toContain("WARN");
      expect(result.output).toContain("400-line");
    });

    it("fails above 500 lines", () => {
      const repo = ownedRepo(ownedSkill("", "line\n".repeat(501)));

      const result = repo.run("validate-agents.mjs");

      expect(result.code).toBe(1);
      expect(result.output).toContain("500-line");
    });
  });

  describe("staleness (diff-based)", () => {
    const SKILL = ".agents/skills/owned-demo/SKILL.md";

    it("has no staleness warning on a clean tree, even if sources are newer than the skill", () => {
      const repo = ownedRepo(ownedSkill());
      repo.write("AGENTS.md", "# Fixture\n\nchanged\n");
      repo.commitAll("source changes after the skill");

      const result = repo.run("validate-agents.mjs");

      expect(result.code).toBe(0);
      expect(result.output).not.toContain("stale");
    });

    it("warns when a declared source changed in the working tree and the skill did not", () => {
      const repo = ownedRepo(ownedSkill());
      repo.write("AGENTS.md", "# Fixture\n\nchanged\n");

      const result = repo.run("validate-agents.mjs");

      expect(result.code).toBe(0);
      expect(result.output).toContain("may be stale");
      expect(result.output).toContain("AGENTS.md");
    });

    it("does not warn when the skill changed in the same diff", () => {
      const repo = ownedRepo(ownedSkill());
      repo.write("AGENTS.md", "# Fixture\n\nchanged\n");
      repo.write(SKILL, ownedSkill("", "# Owned demo\n\nrevised\n"));

      expect(repo.run("validate-agents.mjs").output).not.toContain("stale");
    });

    it("does not warn when only an undeclared file changed", () => {
      const repo = ownedRepo(ownedSkill());
      repo.write("README.md", "unrelated\n");

      expect(repo.run("validate-agents.mjs").output).not.toContain("stale");
    });

    it("--staged looks only at the index", () => {
      const repo = ownedRepo(ownedSkill());
      repo.write("AGENTS.md", "# Fixture\n\nchanged\n");

      expect(
        repo.run("validate-agents.mjs", ["--staged"]).output
      ).not.toContain("stale");

      repo.git("add", "AGENTS.md");

      expect(repo.run("validate-agents.mjs", ["--staged"]).output).toContain(
        "may be stale"
      );
    });

    it("--range looks at a committed range", () => {
      const repo = ownedRepo(ownedSkill());
      repo.write("AGENTS.md", "# Fixture\n\nchanged\n");
      repo.commitAll("source only");

      const stale = repo.run("validate-agents.mjs", ["--range=HEAD~1..HEAD"]);
      expect(stale.code).toBe(0);
      expect(stale.output).toContain("may be stale");

      repo.write(SKILL, ownedSkill("", "# Owned demo\n\nrevised\n"));
      repo.write("AGENTS.md", "# Fixture\n\nchanged again\n");
      repo.commitAll("source and skill");

      expect(
        repo.run("validate-agents.mjs", ["--range=HEAD~1..HEAD"]).output
      ).not.toContain("stale");
    });

    it("fails loudly, rather than skipping staleness, when --range cannot be resolved", () => {
      const repo = ownedRepo(ownedSkill());

      const result = repo.run("validate-agents.mjs", [
        "--range=no-such-ref..HEAD",
      ]);

      expect(result.code).toBe(1);
      expect(result.output).toContain("validate:agents");
      expect(result.output).toContain("no-such-ref");
    });

    describe("pushed range (--before / --after)", () => {
      const ZERO = "0".repeat(40);

      it("judges the range between two SHAs", () => {
        const repo = ownedRepo(ownedSkill());
        const before = repo.git("rev-parse", "HEAD").trim();
        repo.write("AGENTS.md", "# Fixture\n\nchanged\n");
        repo.commitAll("source only");
        const after = repo.git("rev-parse", "HEAD").trim();

        const result = repo.run("validate-agents.mjs", [
          `--before=${before}`,
          `--after=${after}`,
        ]);

        expect(result.code).toBe(0);
        expect(result.output).toContain("may be stale");
      });

      it("falls back to the merge base with main when before is all zeros", () => {
        const repo = ownedRepo(ownedSkill());
        repo.git("checkout", "--quiet", "-b", "feature");
        repo.write("AGENTS.md", "# Fixture\n\nchanged\n");
        repo.commitAll("source only on a new branch");
        const after = repo.git("rev-parse", "HEAD").trim();

        const result = repo.run("validate-agents.mjs", [
          `--before=${ZERO}`,
          `--after=${after}`,
        ]);

        expect(result.code).toBe(0);
        expect(result.output).toContain("may be stale");
      });

      it("fails loudly when the before SHA is not in the clone", () => {
        const repo = ownedRepo(ownedSkill());
        const after = repo.git("rev-parse", "HEAD").trim();

        const result = repo.run("validate-agents.mjs", [
          `--before=${"1".repeat(40)}`,
          `--after=${after}`,
        ]);

        expect(result.code).toBe(1);
        expect(result.output).toContain("not a commit in this clone");
      });

      it("fails loudly when before is all zeros and main cannot be found", () => {
        const repo = ownedRepo(ownedSkill());
        repo.git("branch", "-m", "trunk");
        const after = repo.git("rev-parse", "HEAD").trim();

        const result = repo.run("validate-agents.mjs", [
          `--before=${ZERO}`,
          `--after=${after}`,
        ]);

        expect(result.code).toBe(1);
        expect(result.output).toContain("no merge base with main");
      });
    });
  });

  it("fails a skill that has no description", () => {
    const repo = createGateRepo(["validate-agents.mjs", "lib/git-range.mjs"]);
    repo.write(
      ".agents/skills/bare-demo/SKILL.md",
      "---\nname: bare-demo\n---\n\n# Bare\n"
    );
    repo.commitAll("add bare skill");

    const result = repo.run("validate-agents.mjs");

    expect(result.code).toBe(1);
    expect(result.output).toContain('"description" is required');
  });
});
