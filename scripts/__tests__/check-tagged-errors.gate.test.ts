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

  it("detects a class header wrapped across lines", () => {
    const wrapped = (code: string[]) =>
      [
        "export class VeryLongNamedFailureError",
        '  extends Data.TaggedError("VeryLongNamedFailureError")<{',
        "    readonly reason: string;",
        "  }>",
        "{",
        ...code,
        "}",
        "",
      ].join("\n");
    const missing = repoWith({
      "packages/core/src/w.ts": wrapped([]),
    }).run(GATE, STRICT);
    expect(missing.code).toBe(1);
    expect(missing.output).toContain(
      "VeryLongNamedFailureError must declare a stable code"
    );

    const present = repoWith({
      "packages/core/src/w.ts": wrapped([
        '  readonly code = "wrapped" as const;',
      ]),
    }).run(GATE, STRICT);
    expect(present.code).toBe(0);
  });

  it("does not borrow a later class's code when a class never closes", () => {
    const later = [
      'export class LaterError extends Data.TaggedError("LaterError")<{}> {',
      '  readonly code = "later" as const;',
      "}",
      "",
    ];
    const unclosed = repoWith({
      "packages/core/src/u.ts": [
        'export class OpenError extends Data.TaggedError("OpenError")<{',
        "  readonly reason: string;",
        // no closing line at this indent
        ...later,
      ].join("\n"),
    }).run(GATE, STRICT);
    expect(unclosed.code).toBe(1);
    expect(unclosed.output).toContain("OpenError");
    expect(unclosed.output).toContain("cannot find the end of the class body");

    const closed = repoWith({
      "packages/core/src/u.ts": [
        'export class OpenError extends Data.TaggedError("OpenError")<{',
        "  readonly reason: string;",
        "}> {",
        '  readonly code = "open" as const;',
        "}",
        ...later,
      ].join("\n"),
    }).run(GATE, STRICT);
    expect(closed.code).toBe(0);
  });

  it("handles namespace-imported Schema.TaggedError", () => {
    const res = repoWith({
      "packages/schemas/src/n.ts": [
        'export class NsError extends Schema.TaggedError<NsError>()("NsError", {}) {',
        '  readonly code = "ns" as const;',
        "}",
        "",
      ].join("\n"),
    }).run(GATE, STRICT);
    expect(res.code).toBe(0);
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
