import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const ROOT_AGENTS = `# AGENTS.md — Fixture

## Quick reference

| Task | Command |
| --- | --- |
| Test | \`pnpm test\` |
`;

const PKG_AGENTS = `# AGENTS.md — \`@fixture/core\`

> Scope: \`packages/server/core\` (inherits root AGENTS.md)

## Commands

- \`pnpm test\`
`;

const GLOSSARY = `# Fixture

## Language

**Proposal**:
A pending change.
_Avoid_: Candidate

## Retired vocabulary

**Door A**:
Retired write path.
_Banned_: Door A, Doorway Z
_Use_: Proposal
`;

/** A repo that passes the gate: root + glossary + CLAUDE bridge + one package. */
function cleanRepo() {
  const repo = createGateRepo(["check-agents.mjs"]);
  repo.write("AGENTS.md", ROOT_AGENTS);
  repo.write("docs/glossary.md", GLOSSARY);
  repo.write("CLAUDE.md", "@AGENTS.md\n");
  repo.write("packages/server/AGENTS.md", PKG_AGENTS);
  return repo;
}

const strict = ["--strict"];

describe("check-agents gate", () => {
  it("passes a clean fixture with zero findings", () => {
    const repo = cleanRepo();
    const res = repo.run("check-agents.mjs", strict);
    expect(res.output).toContain("0 finding(s)");
    expect(res.code).toBe(0);
  });

  it("fails a banned mid-build term", () => {
    const repo = cleanRepo();
    repo.write(
      "packages/server/AGENTS.md",
      `${PKG_AGENTS}\nUse Door A here.\n`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("banned");
  });

  it("fails a synonym banned by the fixture glossary, not by a built-in list", () => {
    const repo = cleanRepo();
    repo.write(
      "packages/server/AGENTS.md",
      `${PKG_AGENTS}\nThe Doorway Z path.\n`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain('mid-build term "Doorway Z"');
  });

  it("matches multi-word terms across any whitespace run", () => {
    const repo = cleanRepo();
    repo.write(
      "packages/server/AGENTS.md",
      `${PKG_AGENTS}\nThe Doorway   Z path.\n`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain('mid-build term "Doorway Z"');
  });

  it("matches a term with regex metacharacters literally", () => {
    const repo = cleanRepo();
    repo.write(
      "docs/glossary.md",
      `${GLOSSARY}\n**C++ theater**:\nRetired.\n_Banned_: C++ theater, C++\n`
    );
    repo.write(
      "packages/server/AGENTS.md",
      `${PKG_AGENTS}\nNo C++ theater here.\nA C++ pun.\n`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain('mid-build term "C++ theater"');
    expect(res.output).toContain('mid-build term "C++"');
  });

  it("ignores a term whose metacharacters would only match as a regex", () => {
    const repo = cleanRepo();
    repo.write(
      "docs/glossary.md",
      `${GLOSSARY}\n**C++ theater**:\nRetired.\n_Banned_: C++ theater\n`
    );
    repo.write("packages/server/AGENTS.md", `${PKG_AGENTS}\nCC theater.\n`);
    const res = repo.run("check-agents.mjs", strict);
    expect(res.output).toContain("0 finding(s)");
    expect(res.code).toBe(0);
  });

  it("ignores a _Banned_ line inside a code fence in the glossary", () => {
    const repo = cleanRepo();
    repo.write(
      "docs/glossary.md",
      `${GLOSSARY}\nExample of the format:\n\n\`\`\`md\n_Banned_: Sample Phrase\n\`\`\`\n`
    );
    repo.write(
      "packages/server/AGENTS.md",
      `${PKG_AGENTS}\nA Sample Phrase appears.\n`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.output).toContain("0 finding(s)");
    expect(res.code).toBe(0);
  });

  it("does not ban a term the glossary does not list", () => {
    const repo = cleanRepo();
    repo.write("packages/server/AGENTS.md", `${PKG_AGENTS}\nA Scratch pad.\n`);
    const res = repo.run("check-agents.mjs", strict);
    expect(res.output).toContain("0 finding(s)");
    expect(res.code).toBe(0);
  });

  it("passes a banned term carrying the allowlist comment", () => {
    const repo = cleanRepo();
    repo.write(
      "packages/server/AGENTS.md",
      `${PKG_AGENTS}\nNever use Door A. <!-- check:agents allow-banned -->\n`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.output).toContain("0 finding(s)");
    expect(res.code).toBe(0);
  });

  it("ignores banned terms after a Revision heading", () => {
    const repo = cleanRepo();
    repo.write(
      "packages/server/AGENTS.md",
      `${PKG_AGENTS}\n## Revision\n\nWas Door A.\n`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(0);
  });

  it("fails loudly when docs/glossary.md is missing", () => {
    const bare = createGateRepo(["check-agents.mjs"]);
    bare.write("AGENTS.md", ROOT_AGENTS);
    bare.write("CLAUDE.md", "@AGENTS.md\n");
    const res = bare.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("docs/glossary.md");
  });

  it("fails when the glossary defines no banned terms", () => {
    const repo = cleanRepo();
    repo.write(
      "docs/glossary.md",
      "# Fixture\n\n**Case**:\nAn investigation.\n"
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("_Banned_");
  });

  it("fails a package AGENTS.md without a Scope blurb", () => {
    const repo = cleanRepo();
    repo.write("packages/server/AGENTS.md", "# AGENTS.md\n\n## Commands\n");
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("Scope");
  });

  it("fails a nested AGENTS.md outside the guide directories", () => {
    const repo = cleanRepo();
    repo.write("packages/other/AGENTS.md", PKG_AGENTS);
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain(
      "packages/other/AGENTS.md: nested guides live only in"
    );
  });

  it("fails a guide directory with no AGENTS.md", () => {
    const repo = cleanRepo();
    repo.write("apps/web/index.ts", "export {};\n");
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("missing apps/web/AGENTS.md");
  });

  it("passes a package directory with no AGENTS.md", () => {
    const repo = cleanRepo();
    repo.write("packages/other/index.ts", "export {};\n");
    const res = repo.run("check-agents.mjs", strict);
    expect(res.output).toContain("0 finding(s)");
    expect(res.code).toBe(0);
  });

  it("fails a root AGENTS.md over 120 lines", () => {
    const repo = cleanRepo();
    repo.write("AGENTS.md", `${ROOT_AGENTS}${"- filler line\n".repeat(120)}`);
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("root >120 lines");
  });
  it("fails an oversized nested AGENTS.md", () => {
    const repo = cleanRepo();
    repo.write(
      "packages/server/AGENTS.md",
      `${PKG_AGENTS}${"- filler line\n".repeat(100)}`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("nested >100 lines");
  });

  it("fails a broken relative link in an AGENTS.md", () => {
    const repo = cleanRepo();
    repo.write(
      "packages/server/AGENTS.md",
      `${PKG_AGENTS}\nSee [gone](./nope.md).\n`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("broken link");
  });

  it("does not flag link count or docs-tree content", () => {
    const repo = cleanRepo();
    const links = Array.from(
      { length: 30 },
      (_, i) => `[a${i}](./packages/server/AGENTS.md)`
    ).join(" ");
    repo.write("AGENTS.md", `${ROOT_AGENTS}\n${links}\n`);
    repo.write("docs/broken.md", "[x](./missing.md)\n");
    const res = repo.run("check-agents.mjs", strict);
    expect(res.output).toContain("0 finding(s)");
    expect(res.code).toBe(0);
  });

  it("requires CLAUDE.md to reference @AGENTS.md", () => {
    const repo = cleanRepo();
    repo.write("CLAUDE.md", "# nothing\n");
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("@AGENTS.md");
  });

  describe("@canonical tags", () => {
    function tagRepo(source: string) {
      const repo = cleanRepo();
      repo.write("packages/server/core/src/util.ts", source);
      return repo;
    }

    it("passes a tag on the JSDoc directly above its export", () => {
      const repo = tagRepo(
        "/**\n * Does a thing.\n *\n * @canonical `thing`: when you need a thing\n */\nexport function thing() {}\n"
      );
      const res = repo.run("check-agents.mjs", strict);
      expect(res.output).toContain("0 finding(s)");
      expect(res.code).toBe(0);
    });

    it("passes const, class and re-export lists, and a lint comment between", () => {
      const repo = tagRepo(
        [
          "/** @canonical `a`, `B`: values */",
          "export const a = 1;",
          "export class B {}",
          "/**",
          " * @canonical `C`: a type",
          " */",
          "// oxlint-disable-next-line no-explicit-any",
          "export type C = string;",
          "/** @canonical `thing`: re-exported by name */",
          "export {",
          "  other,",
          "  thing,",
          '} from "./impl";',
        ].join("\n")
      );
      const res = repo.run("check-agents.mjs", strict);
      expect(res.output).toContain("0 finding(s)");
      expect(res.code).toBe(0);
    });

    it("fails a tag whose JSDoc is not directly above the export it names", () => {
      const repo = tagRepo(
        "/** @canonical `thing`: detached */\nconst inner = 1;\nexport function thing() {}\n"
      );
      const res = repo.run("check-agents.mjs", strict);
      expect(res.code).toBe(1);
      expect(res.output).toContain(
        "packages/server/core/src/util.ts:1: @canonical"
      );
      expect(res.output).toContain("must tag the JSDoc directly above");
    });

    it("fails a tag naming an export the module does not have", () => {
      const repo = tagRepo(
        "/** @canonical `thing`, `gone`: two names */\nexport function thing() {}\n"
      );
      const res = repo.run("check-agents.mjs", strict);
      expect(res.code).toBe(1);
      expect(res.output).toContain("does not export `gone`");
    });

    it("fails a name reachable only through export * from", () => {
      const repo = tagRepo(
        '/** @canonical `thing`, `hidden`: two names */\nexport function thing() {}\nexport * from "./impl";\n'
      );
      const res = repo.run("check-agents.mjs", strict);
      expect(res.code).toBe(1);
      expect(res.output).toContain("does not export `hidden`");
    });

    it("fails a tag without names and a use", () => {
      const repo = tagRepo(
        "/** @canonical thing */\nexport function thing() {}\n"
      );
      const res = repo.run("check-agents.mjs", strict);
      expect(res.code).toBe(1);
      expect(res.output).toContain("tag must read");
    });
  });
});
