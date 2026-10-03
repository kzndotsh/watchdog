import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const GATE = "check-effect-edges.mjs";
const STRICT = ["--strict"];

function repoWith(files: Record<string, string>) {
  const repo = createGateRepo([GATE]);
  for (const [rel, content] of Object.entries(files)) {
    repo.write(rel, content);
  }
  return repo;
}

describe("check-effect-edges gate", () => {
  it("passes when run* sits on an allowlisted edge and tryPromise carries a catch", () => {
    const repo = repoWith({
      "packages/api/src/runtime.ts":
        "export const main = () => Effect.runPromise(program);\n",
      "packages/core/src/ok.ts": [
        "export const load = Effect.tryPromise({",
        "  try: () => fetch('x'),",
        "  catch: (cause) => new LoadError({ cause }),",
        "});",
        "",
      ].join("\n"),
    });

    const res = repo.run(GATE, STRICT);

    expect(res.code).toBe(0);
    expect(res.output).toContain("check:effect-edges: ok");
  });

  it("fails when Effect.runPromise appears outside an allowlisted edge", () => {
    const repo = repoWith({
      "packages/core/src/leak.ts":
        "export const go = () => Effect.runPromise(program);\n",
    });

    const res = repo.run(GATE, STRICT);

    expect(res.code).toBe(1);
    expect(res.output).toContain("packages/core/src/leak.ts:1");
    expect(res.output).toContain("outside allowlisted edge");
  });

  it("fails when Effect.tryPromise has no catch", () => {
    const repo = repoWith({
      "packages/db/src/bare.ts":
        "export const q = Effect.tryPromise(() => fetch('x'));\n",
    });

    const res = repo.run(GATE, STRICT);

    expect(res.code).toBe(1);
    expect(res.output).toContain("must use { try, catch }");
  });

  it("fails when production code throws DomainError", () => {
    const repo = repoWith({
      "packages/policy/src/bad.ts":
        "export const f = () => { throw new DomainError('x'); };\n",
    });

    const res = repo.run(GATE, STRICT);

    expect(res.code).toBe(1);
    expect(res.output).toContain("throw DomainError");
  });

  it("ignores tests and comment lines", () => {
    const repo = repoWith({
      "packages/core/src/__tests__/x.ts":
        "export const t = () => Effect.runPromise(program);\n",
      "packages/core/src/x.test.ts":
        "export const t = () => Effect.runSync(program);\n",
      "packages/core/src/doc.ts":
        "// Effect.runPromise(program) in a comment\n",
    });

    expect(repo.run(GATE, STRICT).code).toBe(0);
  });

  it("only warns without --strict", () => {
    const repo = repoWith({
      "packages/core/src/leak.ts":
        "export const go = () => Effect.runSync(program);\n",
    });

    const res = repo.run(GATE);

    expect(res.code).toBe(0);
    expect(res.output).toContain("[warn]");
  });
});
