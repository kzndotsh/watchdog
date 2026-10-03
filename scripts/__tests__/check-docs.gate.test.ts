import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

function docsRepo(files: Record<string, string>) {
  const repo = createGateRepo(["check-docs.mjs"]);
  repo.write("docs/README.md", "# Docs\n\n- [Page](page.md)\n");
  repo.write("AGENTS.md", "# Agents\n");
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
});
