import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

// The gate resolves `../src` from its own location, so keep the app layout.
const GATE = "apps/web/scripts/ds-ban-check.mjs";

function repoWith(files: Record<string, string>) {
  const repo = createGateRepo([]);
  repo.copyFromRepo(GATE);
  for (const [rel, content] of Object.entries(files)) {
    repo.write(`apps/web/src/${rel}`, content);
  }
  return repo;
}

describe("ds-ban-check gate (apps/web)", () => {
  it("passes a source tree with no banned patterns", () => {
    const repo = repoWith({
      "domains/cases/ok.tsx":
        'export function CaseList() { return <div className="p-2" />; }\n',
    });

    const res = repo.runFile(GATE);

    expect(res.code).toBe(0);
    expect(res.output).toContain("ds-ban-check passed");
  });

  it("fails a gradient class (refuse list)", () => {
    const repo = repoWith({
      "domains/cases/pretty.tsx":
        'export const x = <div className="bg-gradient-to-r from-a to-b" />;\n',
    });

    const res = repo.runFile(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("Gradient / gradient text / glass");
    expect(res.output).toContain("domains/cases/pretty.tsx:1");
  });

  it("fails a banned surface name", () => {
    const repo = repoWith({
      "domains/cases/console.tsx":
        "export function CaseConsole() { return null; }\n",
    });

    const res = repo.runFile(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("Banned surface name");
    expect(res.output).toContain("CaseConsole");
  });

  it("fails a truncated opaque id in a domain", () => {
    const repo = repoWith({
      "domains/jobs/id.tsx":
        "export const short = (id: string) => id.slice(0, 8);\n",
    });

    const res = repo.runFile(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("Opaque id/hash via .slice");
  });

  it("honours a ds:allow escape hatch with a reason on the line above", () => {
    const repo = repoWith({
      "domains/cases/allowed.tsx": [
        "// ds:allow-decorative — hero art approved in review",
        'export const x = <div className="bg-gradient-to-r" />;',
        "",
      ].join("\n"),
    });

    const res = repo.runFile(GATE);

    expect(res.code).toBe(0);
    expect(res.output).toContain("1 ds:allow escape hatch(es) in use");
  });
});
