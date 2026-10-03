import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const CONVENTIONS = "docs/reference/platform/conventions.md";
const HEADER = [
  "| Rule | Scope | Stated in | Enforced by | Status |",
  "| --- | --- | --- | --- | --- |",
];

function conventions(...rows: string[]) {
  return ["# Conventions", "", ...HEADER, ...rows, ""].join("\n");
}

const GOOD_ROW =
  "| No raw colors | web | `ui/rules.md` | `check:size` | enforced |";

function docsRepo(files: Record<string, string>) {
  const repo = createGateRepo(["check-docs.mjs"]);
  repo.write("docs/README.md", "# Docs\n\n- [Page](page.md)\n");
  repo.write("AGENTS.md", "# Agents\n");
  repo.write(
    "package.json",
    JSON.stringify({ scripts: { "check:size": "node x.mjs" } })
  );
  repo.write(
    "packages/db/package.json",
    JSON.stringify({ scripts: { "check:repos": "node y.mjs" } })
  );
  repo.write(CONVENTIONS, conventions(GOOD_ROW));
  for (const [rel, content] of Object.entries(files)) {
    repo.write(rel, content);
  }
  repo.commitAll("docs fixture");
  return repo;
}

describe("check-docs gate", () => {
  it("strict mode fails on a broken link", () => {
    const repo = docsRepo({ "docs/page.md": "# Page\n\n[gone](missing.md)\n" });
    const res = repo.run("check-docs.mjs", ["--strict"]);
    expect(res.code).toBe(1);
    expect(res.output).toContain("broken link");
  });

  it("strict mode passes a clean tree", () => {
    const repo = docsRepo({ "docs/page.md": "# Page\n\n[home](README.md)\n" });
    expect(repo.run("check-docs.mjs", ["--strict"]).code).toBe(0);
  });

  it("resolves anchors to em dash and non-ASCII headings", () => {
    const repo = docsRepo({
      "docs/other.md": "# Other\n\n## Alpha — beta\n",
      "docs/page.md": [
        "# Page",
        "",
        "## Alpha — beta",
        "",
        "## Café résumé",
        "",
        "## What's `new`? (v2.0)",
        "",
        "[a](#alpha--beta) [b](#café-résumé) [c](#whats-new-v20)",
        "[d](README.md) [e](other.md#alpha--beta)",
        "",
      ].join("\n"),
    });
    const res = repo.run("check-docs.mjs", ["--strict"]);
    expect(res.output).not.toContain("broken anchor");
    expect(res.code).toBe(0);
  });

  it("de-duplicates repeated headings with -1, -2 suffixes", () => {
    const repo = docsRepo({
      "docs/page.md":
        "# Page\n\n## Same\n\n## Same\n\n## Same\n\n[a](#same) [b](#same-1) [c](#same-2)\n",
    });
    expect(repo.run("check-docs.mjs", ["--strict"]).code).toBe(0);
    const bad = docsRepo({
      "docs/page.md": "# Page\n\n## Same\n\n[x](#same-1)\n",
    });
    expect(bad.run("check-docs.mjs", ["--strict"]).code).toBe(1);
  });

  it("strict mode fails on a broken anchor, in-page and cross-file", () => {
    const repo = docsRepo({
      "docs/other.md": "# Other\n\n[b](page.md#also-nope)\n",
      "docs/page.md": "# Page\n\n[a](#nope)\n",
    });
    const res = repo.run("check-docs.mjs", ["--strict"]);
    expect(res.code).toBe(1);
    expect(res.output).toContain("broken anchor → #nope");
    expect(res.output).toContain("#also-nope");
  });

  describe("conventions table", () => {
    const convRepo = (content: string) =>
      docsRepo({
        "docs/page.md": "# Page\n\n[home](README.md)\n",
        [CONVENTIONS]: content,
      });

    it("passes a well-formed table, including workspace scripts and guidance rows", () => {
      const repo = convRepo(
        conventions(
          GOOD_ROW,
          "| Repo SQL only | db | `db/AGENTS.md` | `check:repos` | baselined |",
          "| Copy tone | web | `ux.md` | guidance | guidance |"
        )
      );
      const res = repo.run("check-docs.mjs", ["--strict"]);
      expect(res.output).not.toContain("FAIL");
      expect(res.code).toBe(0);
    });

    it("fails a row with an empty enforced-by cell, quoting the row", () => {
      const row = "| Empty enforcer | web | `ui/rules.md` |  | enforced |";
      const repo = convRepo(conventions(GOOD_ROW, row));
      const res = repo.run("check-docs.mjs", ["--strict"]);
      expect(res.code).toBe(1);
      expect(res.output).toContain("empty enforced-by");
      expect(res.output).toContain("Empty enforcer");
    });

    it("fails a row with an unknown status", () => {
      const row = "| Odd status | web | `ui/rules.md` | `check:size` | maybe |";
      const repo = convRepo(conventions(row));
      const res = repo.run("check-docs.mjs", ["--strict"]);
      expect(res.code).toBe(1);
      expect(res.output).toContain("invalid status");
      expect(res.output).toContain("Odd status");
    });

    it("fails an enforced row whose enforced-by is guidance", () => {
      const row =
        "| Fake enforced | web | `ui/rules.md` | guidance | enforced |";
      const repo = convRepo(conventions(row));
      const res = repo.run("check-docs.mjs", ["--strict"]);
      expect(res.code).toBe(1);
      expect(res.output).toContain("guidance");
      expect(res.output).toContain("Fake enforced");
    });

    it("fails a baselined row whose enforced-by is guidance", () => {
      const row =
        "| Fake baseline | web | `ui/rules.md` | guidance | baselined |";
      const repo = convRepo(conventions(row));
      expect(repo.run("check-docs.mjs", ["--strict"]).code).toBe(1);
    });

    it("fails a row naming a script that no package.json defines", () => {
      const row =
        "| Ghost gate | repo | `ci-gates.md` | `check:nonexistent` | enforced |";
      const repo = convRepo(conventions(row));
      const res = repo.run("check-docs.mjs", ["--strict"]);
      expect(res.code).toBe(1);
      expect(res.output).toContain("check:nonexistent");
      expect(res.output).toContain("Ghost gate");
    });

    it("fails a row naming a test file that does not exist", () => {
      const row =
        "| Ghost test | repo | `ci-gates.md` | `packages/x/src/__tests__/gone.test.ts` | enforced |";
      const repo = convRepo(conventions(row));
      const res = repo.run("check-docs.mjs", ["--strict"]);
      expect(res.code).toBe(1);
      expect(res.output).toContain("gone.test.ts");
    });

    it("fails when the conventions page is missing", () => {
      const repo = convRepo(conventions(GOOD_ROW));
      repo.git("rm", "--quiet", "-f", CONVENTIONS);
      expect(repo.run("check-docs.mjs", ["--strict"]).code).toBe(1);
    });

    it("fails a second table whose header is mistyped instead of skipping its rows", () => {
      const repo = convRepo(
        [
          conventions(GOOD_ROW),
          "## Web",
          "",
          "| Rule | Scope | Stated in | Enforcer | Status |",
          "| --- | --- | --- | --- | --- |",
          "| Hidden bad row | web | `ui/rules.md` | guidance | enforced |",
          "",
        ].join("\n")
      );
      const res = repo.run("check-docs.mjs", ["--strict"]);
      expect(res.code).toBe(1);
      expect(res.output).toContain("header must be exactly");
      expect(res.output).toContain("Enforcer");
    });

    it("fails a table whose columns are in the wrong order", () => {
      const repo = convRepo(
        [
          "# Conventions",
          "",
          "| Rule | Scope | Stated in | Status | Enforced by |",
          "| --- | --- | --- | --- | --- |",
          "| Swapped | web | `ui/rules.md` | enforced | `check:size` |",
          "",
        ].join("\n")
      );
      const res = repo.run("check-docs.mjs", ["--strict"]);
      expect(res.code).toBe(1);
      expect(res.output).toContain("header must be exactly");
    });

    it("fails a row with an extra column and says escaped pipes are unsupported", () => {
      const row =
        "| Extra cell | web | `ui/rules.md` | `check:size` \\| `check:repos` | enforced |";
      const repo = convRepo(conventions(GOOD_ROW, row));
      const res = repo.run("check-docs.mjs", ["--strict"]);
      expect(res.code).toBe(1);
      expect(res.output).toContain("expected 5 cells");
      expect(res.output).toContain("escaped pipes");
      expect(res.output).toContain("Extra cell");
    });

    it("fails when the page has no conventions table", () => {
      const repo = convRepo("# Conventions\n\nProse only.\n");
      const res = repo.run("check-docs.mjs", ["--strict"]);
      expect(res.code).toBe(1);
      expect(res.output).toContain("no conventions table");
    });
  });
});
