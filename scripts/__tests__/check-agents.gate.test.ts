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

> Scope: \`packages/core\` (inherits root AGENTS.md)

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
  repo.write("GLOSSARY.md", GLOSSARY);
  repo.write("CLAUDE.md", "@AGENTS.md\n");
  repo.write("packages/core/AGENTS.md", PKG_AGENTS);
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
    repo.write("packages/core/AGENTS.md", `${PKG_AGENTS}\nUse Door A here.\n`);
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("banned");
  });

  it("fails a synonym banned by the fixture glossary, not by a built-in list", () => {
    const repo = cleanRepo();
    repo.write(
      "packages/core/AGENTS.md",
      `${PKG_AGENTS}\nThe Doorway Z path.\n`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain('mid-build term "Doorway Z"');
  });

  it("matches multi-word terms across any whitespace run", () => {
    const repo = cleanRepo();
    repo.write(
      "packages/core/AGENTS.md",
      `${PKG_AGENTS}\nThe Doorway   Z path.\n`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain('mid-build term "Doorway Z"');
  });

  it("matches a term with regex metacharacters literally", () => {
    const repo = cleanRepo();
    repo.write(
      "GLOSSARY.md",
      `${GLOSSARY}\n**C++ theater**:\nRetired.\n_Banned_: C++ theater, C++\n`
    );
    repo.write(
      "packages/core/AGENTS.md",
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
      "GLOSSARY.md",
      `${GLOSSARY}\n**C++ theater**:\nRetired.\n_Banned_: C++ theater\n`
    );
    repo.write("packages/core/AGENTS.md", `${PKG_AGENTS}\nCC theater.\n`);
    const res = repo.run("check-agents.mjs", strict);
    expect(res.output).toContain("0 finding(s)");
    expect(res.code).toBe(0);
  });

  it("ignores a _Banned_ line inside a code fence in the glossary", () => {
    const repo = cleanRepo();
    repo.write(
      "GLOSSARY.md",
      `${GLOSSARY}\nExample of the format:\n\n\`\`\`md\n_Banned_: Sample Phrase\n\`\`\`\n`
    );
    repo.write(
      "packages/core/AGENTS.md",
      `${PKG_AGENTS}\nA Sample Phrase appears.\n`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.output).toContain("0 finding(s)");
    expect(res.code).toBe(0);
  });

  it("does not ban a term the glossary does not list", () => {
    const repo = cleanRepo();
    repo.write("packages/core/AGENTS.md", `${PKG_AGENTS}\nA Scratch pad.\n`);
    const res = repo.run("check-agents.mjs", strict);
    expect(res.output).toContain("0 finding(s)");
    expect(res.code).toBe(0);
  });

  it("passes a banned term carrying the allowlist comment", () => {
    const repo = cleanRepo();
    repo.write(
      "packages/core/AGENTS.md",
      `${PKG_AGENTS}\nNever use Door A. <!-- check:agents allow-banned -->\n`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.output).toContain("0 finding(s)");
    expect(res.code).toBe(0);
  });

  it("ignores banned terms after a Revision heading", () => {
    const repo = cleanRepo();
    repo.write(
      "packages/core/AGENTS.md",
      `${PKG_AGENTS}\n## Revision\n\nWas Door A.\n`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(0);
  });

  it("fails loudly when GLOSSARY.md is missing", () => {
    const bare = createGateRepo(["check-agents.mjs"]);
    bare.write("AGENTS.md", ROOT_AGENTS);
    bare.write("CLAUDE.md", "@AGENTS.md\n");
    const res = bare.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("GLOSSARY.md");
  });

  it("fails when the glossary defines no banned terms", () => {
    const repo = cleanRepo();
    repo.write("GLOSSARY.md", "# Fixture\n\n**Case**:\nAn investigation.\n");
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("_Banned_");
  });

  it("fails a package AGENTS.md without a Commands section", () => {
    const repo = cleanRepo();
    repo.write(
      "packages/core/AGENTS.md",
      "# AGENTS.md\n\n> Scope: `packages/core`\n"
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("Commands");
  });

  it("fails a package AGENTS.md without a Scope blurb", () => {
    const repo = cleanRepo();
    repo.write("packages/core/AGENTS.md", "# AGENTS.md\n\n## Commands\n");
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("Scope");
  });

  it("fails a package directory with no AGENTS.md", () => {
    const repo = cleanRepo();
    repo.write("packages/other/index.ts", "export {};\n");
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("missing packages/other/AGENTS.md");
  });

  it("fails an oversized nested AGENTS.md", () => {
    const repo = cleanRepo();
    repo.write(
      "packages/core/AGENTS.md",
      `${PKG_AGENTS}${"- filler line\n".repeat(160)}`
    );
    const res = repo.run("check-agents.mjs", strict);
    expect(res.code).toBe(1);
    expect(res.output).toContain("nested >150 lines");
  });

  it("fails a broken relative link in an AGENTS.md", () => {
    const repo = cleanRepo();
    repo.write(
      "packages/core/AGENTS.md",
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
      (_, i) => `[a${i}](./packages/core/AGENTS.md)`
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

  describe("Canonical helpers section", () => {
    const section = (rows: string) =>
      `${ROOT_AGENTS}\n## Canonical helpers\n\n| Concern | Module | Export |\n| --- | --- | --- |\n${rows}\n`;

    function helperRepo(rows: string, source?: string) {
      const repo = cleanRepo();
      repo.write("AGENTS.md", section(rows));
      if (source !== undefined) repo.write("packages/core/src/util.ts", source);
      return repo;
    }

    it("passes a row whose module exports the identifier", () => {
      const repo = helperRepo(
        "| Thing | `packages/core/src/util.ts` | `thing` |",
        "export function thing() {}\n"
      );
      const res = repo.run("check-agents.mjs", strict);
      expect(res.output).toContain("0 finding(s)");
      expect(res.code).toBe(0);
    });

    it("passes const, class, type, interface and renamed list exports", () => {
      const repo = helperRepo(
        [
          "| A | `packages/core/src/util.ts` | `a` |",
          "| B | `packages/core/src/util.ts` | `B` |",
          "| C | `packages/core/src/util.ts` | `C` |",
          "| D | `packages/core/src/util.ts` | `D` |",
          "| E | `packages/core/src/util.ts` | `renamed` |",
        ].join("\n"),
        [
          "export const a = 1;",
          "export class B {}",
          "export type C = string;",
          "export interface D {}",
          "const inner = 1;",
          "export { inner as renamed };",
        ].join("\n")
      );
      const res = repo.run("check-agents.mjs", strict);
      expect(res.output).toContain("0 finding(s)");
      expect(res.code).toBe(0);
    });

    it("passes an identifier re-exported by name with export { X } from", () => {
      const repo = helperRepo(
        "| Thing | `packages/core/src/util.ts` | `thing` |",
        'export {\n  other,\n  thing,\n} from "./impl";\n'
      );
      const res = repo.run("check-agents.mjs", strict);
      expect(res.output).toContain("0 finding(s)");
      expect(res.code).toBe(0);
    });

    it("fails an identifier reachable only through export * from", () => {
      const repo = helperRepo(
        "| Thing | `packages/core/src/util.ts` | `thing` |",
        'export * from "./impl";\n'
      );
      const res = repo.run("check-agents.mjs", strict);
      expect(res.code).toBe(1);
      expect(res.output).toContain("does not export `thing`");
    });

    it("fails a row naming an export the module does not have", () => {
      const repo = helperRepo(
        "| Thing | `packages/core/src/util.ts` | `gone` |",
        "export function thing() {}\n"
      );
      const res = repo.run("check-agents.mjs", strict);
      expect(res.code).toBe(1);
      expect(res.output).toContain("does not export `gone`");
      expect(res.output).toContain("Thing");
    });

    it("fails a row whose module file is missing", () => {
      const repo = helperRepo(
        "| Thing | `packages/core/src/nope.ts` | `thing` |"
      );
      const res = repo.run("check-agents.mjs", strict);
      expect(res.code).toBe(1);
      expect(res.output).toContain(
        "module not found: packages/core/src/nope.ts"
      );
    });

    it("fails a row that is not module and export in backticks", () => {
      const repo = helperRepo("| Thing | packages/core/src/util.ts | thing |");
      const res = repo.run("check-agents.mjs", strict);
      expect(res.code).toBe(1);
      expect(res.output).toContain("malformed Canonical helpers row");
    });

    it("checks a nested AGENTS.md that has the section", () => {
      const repo = cleanRepo();
      repo.write(
        "packages/core/AGENTS.md",
        `${PKG_AGENTS}\n## Canonical helpers\n\n| Concern | Module | Export |\n| --- | --- | --- |\n| Thing | \`packages/core/nope.ts\` | \`thing\` |\n`
      );
      const res = repo.run("check-agents.mjs", strict);
      expect(res.code).toBe(1);
      expect(res.output).toContain("packages/core/AGENTS.md");
    });

    it("runs no check when there is no Canonical helpers section", () => {
      const repo = cleanRepo();
      const res = repo.run("check-agents.mjs", strict);
      expect(res.output).toContain("0 finding(s)");
      expect(res.code).toBe(0);
    });
  });
});
