import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const GATE = "check-tagged-errors.mjs";
const STRICT = ["--strict"];

function repoWith(files: Record<string, string>) {
  const repo = createGateRepo([GATE]);
  for (const [rel, content] of Object.entries(files)) {
    repo.write(rel, content);
  }
  return repo;
}

const CLEAN = [
  'import { Data } from "effect";',
  "",
  'export class VaultError extends Data.TaggedError("VaultError")<{',
  "  readonly reason: string;",
  "}> {",
  '  readonly code = "vault" as const;',
  "}",
  "",
  'export class TinyError extends Data.TaggedError("TinyError")<{}> {',
  '  readonly code = "tiny" as const;',
  "}",
  "",
].join("\n");

describe("check-tagged-errors gate", () => {
  it("passes when every tagged error ends in Error and declares a code", () => {
    const repo = repoWith({ "packages/core/src/errors.ts": CLEAN });

    const res = repo.run(GATE, STRICT);

    expect(res.code).toBe(0);
    expect(res.output).toContain("check:tagged-errors: ok");
  });

  it("fails when a tagged error class lacks the Error suffix", () => {
    const repo = repoWith({
      "packages/core/src/bad-name.ts": [
        'export class ScratchCleanupFailed extends Data.TaggedError("ScratchCleanupFailed")<{',
        "  readonly cause: unknown;",
        "}> {",
        '  readonly code = "scratch_cleanup" as const;',
        "}",
        "",
      ].join("\n"),
    });

    const res = repo.run(GATE, STRICT);

    expect(res.code).toBe(1);
    expect(res.output).toContain("ScratchCleanupFailed must end in Error");
  });

  it("fails when a tagged error class declares no code", () => {
    const repo = repoWith({
      "apps/worker/src/no-code.ts": [
        'class WorkerBossError extends Data.TaggedError("WorkerBossError")<{',
        "  readonly cause: unknown;",
        "}> {}",
        "",
      ].join("\n"),
    });

    const res = repo.run(GATE, STRICT);

    expect(res.code).toBe(1);
    expect(res.output).toContain("WorkerBossError must declare a stable code");
  });

  it("fails when two tagged error classes share a code", () => {
    const repo = repoWith({
      "packages/core/src/a.ts": CLEAN,
      "packages/tools/src/b.ts": [
        'export class OtherError extends Data.TaggedError("OtherError")<{}> {',
        '  readonly code = "vault" as const;',
        "}",
        "",
      ].join("\n"),
    });

    const res = repo.run(GATE, STRICT);

    expect(res.code).toBe(1);
    expect(res.output).toContain('reuses code "vault"');
  });

  it("fails on Schema tagged errors that lack a code", () => {
    const repo = repoWith({
      "packages/schemas/src/s.ts": [
        'export class WireError extends Schema.TaggedErrorClass<WireError>()("WireError", {',
        "  reason: Schema.String,",
        "}) {}",
        "",
      ].join("\n"),
    });

    const res = repo.run(GATE, STRICT);

    expect(res.code).toBe(1);
    expect(res.output).toContain("WireError must declare a stable code");
  });

  it("ignores tests and __tests__ fixtures", () => {
    const repo = repoWith({
      "packages/core/src/__tests__/fixture.ts":
        'class FakeFailed extends Data.TaggedError("FakeFailed")<{}> {}\n',
      "packages/core/src/x.test.ts":
        'class OtherFailed extends Data.TaggedError("OtherFailed")<{}> {}\n',
    });

    const res = repo.run(GATE, STRICT);

    expect(res.code).toBe(0);
  });

  it("only warns without --strict", () => {
    const repo = repoWith({
      "packages/core/src/bad.ts":
        'class BadFailed extends Data.TaggedError("BadFailed")<{}> {}\n',
    });

    const res = repo.run(GATE);

    expect(res.code).toBe(0);
    expect(res.output).toContain("[warn]");
  });
});
