/**
 * Proves the real `oxlint.config.ts` enforces the Effect edge conventions the retired
 * `check-effect-edges.mjs` regex gate used to: `Effect.run*` (and `appRuntime.runPromise`)
 * only on the five sanctioned edge files, and `Effect.try` / `Effect.tryPromise` only with
 * an inline `{ try, catch }` object, in production source of the old gate's roots. Also
 * proves the two Effect language-service rules the config turns on over the same roots
 * (`unknown-in-effect-catch`, `run-effect-inside-effect`). Probe files are written into a
 * throwaway repo that carries the real config and plugin (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { findingsFor, oxlintFixtureFactory } from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RUN = "watchdog/no-effect-run-outside-edge";
const TRY = "watchdog/effect-try-requires-catch";
const UNKNOWN_CATCH = "effecttsgo/unknown-in-effect-catch";
const RUN_INSIDE = "effecttsgo/run-effect-inside-effect";

const PROBE = "packages/core/src/probe";
const IMPORT = 'import { Effect } from "effect";\n';

const RUN_FAIL = {
  "run-promise": `${IMPORT}export const a = () => Effect.runPromise(Effect.void);\n`,
  "run-promise-exit": `${IMPORT}export const a = () => Effect.runPromiseExit(Effect.void);\n`,
  "run-sync": `${IMPORT}export const a = () => Effect.runSync(Effect.void);\n`,
  "run-sync-exit": `${IMPORT}export const a = () => Effect.runSyncExit(Effect.void);\n`,
  "run-fork": `${IMPORT}export const a = () => Effect.runFork(Effect.void);\n`,
  "run-callback": `${IMPORT}export const a = () => Effect.runCallback(Effect.void);\n`,
  "run-promise-with": `${IMPORT}export const a = (c: never) => Effect.runPromiseWith(c)(Effect.void);\n`,
  "run-promise-exit-with": `${IMPORT}export const a = (c: never) => Effect.runPromiseExitWith(c)(Effect.void);\n`,
  "computed-literal": `${IMPORT}export const a = () => Effect["runPromise"](Effect.void);\n`,
  "computed-template": `${IMPORT}export const a = () => Effect[\`runSync\`](Effect.void);\n`,
  "import-after-call": `export const a = () => E.runPromise(E.void);\nimport { Effect as E } from "effect";\n`,
  "named-import-after-call": `export const a = () => go(1 as never);\nimport { runFork as go } from "effect/Effect";\n`,
  "app-runtime": `export const a = (appRuntime: { runPromise: (e: unknown) => unknown }) => appRuntime.runPromise(1);\n`,
  "aliased-namespace": `import { Effect as E } from "effect";\nexport const a = () => E.runPromise(E.void);\n`,
  "namespace-import": `import * as E from "effect/Effect";\nexport const a = () => E.runSync(E.void);\n`,
  "named-import": `import { runPromise } from "effect/Effect";\nexport const a = () => runPromise(1 as never);\n`,
  "named-import-aliased": `import { runFork as go } from "effect/Effect";\nexport const a = () => go(1 as never);\n`,
} as const;

const RUN_PASS = {
  comment: `${IMPORT}// Effect.runPromise(program) in a comment\nexport const a = Effect.void;\n`,
  string: `export const a = "Effect.runPromise(program)";\n`,
  "other-effect-call": `${IMPORT}export const a = Effect.succeed(1);\n`,
  "other-object-run-promise": `export const a = (queue: { runPromise: () => void }) => queue.runPromise();\n`,
  "shadowed-parameter": `${IMPORT}export const a = (Effect: { runPromise: (x: unknown) => void }) => Effect.runPromise(1);\nexport const b = Effect.void;\n`,
  "shadowed-local": `export const a = () => {\n  const Effect = { runSync: (x: unknown) => x };\n  return Effect.runSync(1);\n};\n`,
  "shadowed-named-import": `import { runPromise } from "effect/Effect";\nexport const a = (runPromise: () => void) => runPromise();\nexport const b = runPromise;\n`,
  "computed-dynamic": `${IMPORT}export const a = (k: "runPromise") => Effect[k](Effect.void);\n`,
  "run-named-non-effect": `export const a = (m: { runSync: () => void }) => m.runSync();\n`,
} as const;

const TRY_FAIL = {
  "bare-try-promise": `${IMPORT}export const a = Effect.tryPromise(() => fetch("x"));\n`,
  "bare-try": `${IMPORT}export const a = Effect.try(() => JSON.parse("{}"));\n`,
  "object-without-catch": `${IMPORT}export const a = Effect.tryPromise({ try: () => fetch("x") });\n`,
  "options-by-reference": `${IMPORT}const options = { try: () => fetch("x"), catch: (e: unknown) => e };\nexport const a = Effect.tryPromise(options);\n`,
  "aliased-namespace": `import { Effect as E } from "effect";\nexport const a = E.try(() => 1);\n`,
  "computed-literal": `${IMPORT}export const a = Effect["tryPromise"](() => fetch("x"));\n`,
  "spread-only-options": `${IMPORT}declare const base: { catch: () => Error };\nexport const a = Effect.try({ try: () => 1, ...base });\n`,
  "import-after-call": `export const a = E.try(() => 1);\nimport { Effect as E } from "effect";\n`,
  "named-import": `import { tryPromise } from "effect/Effect";\nexport const a = tryPromise(() => fetch("x"));\n`,
  // The old script accepted this: a `catch:` appears within 200 lines, but it belongs to
  // the next call, not to the bare tryPromise above it.
  "catch-belongs-to-other-call": [
    IMPORT,
    'export const bare = Effect.tryPromise(() => fetch("x"));',
    "export const wrapped = Effect.tryPromise({",
    '  try: () => fetch("y"),',
    "  catch: (cause) => new Error(String(cause)),",
    "});",
    "",
  ].join("\n"),
  "catch-in-nested-call": [
    IMPORT,
    "export const a = Effect.tryPromise(() => fetch('x')).pipe(",
    "  Effect.catch((cause) => Effect.fail(cause)),",
    ");",
    "export const b = { catch: () => 1 };",
    "",
  ].join("\n"),
} as const;

const TRY_PASS = {
  "try-promise-with-catch": `${IMPORT}class LoadError extends Error {}\nexport const a = Effect.tryPromise({\n  try: () => fetch("x"),\n  catch: (cause) => new LoadError(String(cause)),\n});\n`,
  "try-with-catch": `${IMPORT}class ParseError extends Error {}\nexport const a = Effect.try({\n  try: () => JSON.parse("{}"),\n  catch: (cause) => new ParseError(String(cause)),\n});\n`,
  "quoted-catch-key": `${IMPORT}export const a = Effect.try({\n  try: () => 1,\n  "catch": () => new Error("x"),\n});\n`,
  "shadowed-parameter": `${IMPORT}export const a = (Effect: { try: (f: () => void) => void }) => Effect.try(() => {});\nexport const b = Effect.void;\n`,
  "other-try-call": `export const a = (x: { try: (f: () => void) => void }) => x.try(() => {});\n`,
  "comment-only": `${IMPORT}// Effect.tryPromise(() => fetch("x")) in a comment\nexport const a = Effect.void;\n`,
} as const;

const SANCTIONED = [
  "packages/api/src/runtime.ts",
  "apps/worker/src/boot-worker.ts",
  "packages/core/src/infra/run-domain.ts",
  "packages/core/src/infra/postgres-tx.ts",
  "packages/caps/src/sdk/run.ts",
] as const;

const OUT_OF_SCOPE = [
  "packages/core/src/__tests__/probe.ts",
  "packages/core/src/probe.test.ts",
  "packages/api/src/nested/__tests__/deep/probe.ts",
  "apps/web/src/probe.test.tsx",
  "packages/schemas/src/probe.ts",
  "packages/test-kit/src/probe.ts",
  "scripts/probe.ts",
] as const;

/** A sanctioned edge: runs an Effect and keeps its tryPromise valid. */
const SANCTIONED_SOURCE = `${IMPORT}export const a = () => Effect.runPromise(Effect.void);\nexport const b = Effect.tryPromise({\n  try: () => fetch("x"),\n  catch: (cause) => new Error(String(cause)),\n});\n`;

const EDGE_SOURCE = `${IMPORT}export const a = () => Effect.runPromise(Effect.void);\nexport const b = Effect.tryPromise(() => fetch("x"));\n`;

/** Production roots the old script walked, one probe file per root. */
const ROOTS = [
  "packages/core/src",
  "packages/api/src",
  "packages/tools/src",
  "packages/policy/src",
  "packages/caps/src",
  "packages/ai/src",
  "packages/db/src",
  "apps/cli/src",
  "packages/log/src",
  "apps/worker/src",
  "apps/web/src",
] as const;

const LANG_SERVICE = {
  "unknown-catch": `${IMPORT}export const a = Effect.tryPromise({\n  try: () => fetch("x"),\n  catch: (cause) => cause,\n});\n`,
  "run-inside-effect": `${IMPORT}export const a = Effect.gen(function* () {\n  return yield* Effect.sync(() => Effect.runSync(Effect.succeed(1)));\n});\n`,
} as const;

const createFixture = oxlintFixtureFactory();

let result: LintResult;

beforeAll(() => {
  const fixture = createFixture();
  fixture.write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        strict: true,
        module: "nodenext",
        moduleResolution: "nodenext",
        target: "es2022",
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["packages", "apps"],
    })
  );
  for (const [name, src] of Object.entries({ ...RUN_FAIL, ...RUN_PASS })) {
    fixture.write(`${PROBE}/run/${name}.ts`, src);
  }
  for (const [name, src] of Object.entries({ ...TRY_FAIL, ...TRY_PASS })) {
    fixture.write(`${PROBE}/try/${name}.ts`, src);
  }
  for (const file of SANCTIONED) {
    fixture.write(file, SANCTIONED_SOURCE);
  }
  for (const file of OUT_OF_SCOPE) {
    fixture.write(file, EDGE_SOURCE);
  }
  for (const root of ROOTS) {
    fixture.write(`${root}/edge-probe.ts`, EDGE_SOURCE);
  }
  for (const [name, src] of Object.entries(LANG_SERVICE)) {
    fixture.write(`packages/api/src/lang/${name}.ts`, src);
    fixture.write(`packages/core/src/lang/${name}.ts`, src);
  }
  fixture.write(
    "packages/core/src/lang/__tests__/unknown-catch.ts",
    LANG_SERVICE["unknown-catch"]
  );
  result = fixture.lint(["packages", "apps", "scripts/probe.ts"]);
});

const hitsFor = (file: string, rule: string) => findingsFor(result, file, rule);

describe("Effect run* edge ban (oxlint.config.ts)", () => {
  it.each(Object.keys(RUN_FAIL))("rejects %s", (name) => {
    expect(hitsFor(`${PROBE}/run/${name}.ts`, RUN)).toHaveLength(1);
  });
  it.each(Object.keys(RUN_PASS))("allows %s", (name) => {
    expect(hitsFor(`${PROBE}/run/${name}.ts`, RUN)).toHaveLength(0);
  });
  it.each(SANCTIONED)("allows the sanctioned edge %s", (file) => {
    expect(hitsFor(file, RUN)).toHaveLength(0);
    expect(hitsFor(file, TRY)).toHaveLength(0);
  });
  it.each(ROOTS)("covers the old root %s", (root) => {
    expect(hitsFor(`${root}/edge-probe.ts`, RUN)).toHaveLength(1);
  });
  it.each(OUT_OF_SCOPE)("ignores tests and non-roots: %s", (file) => {
    expect(hitsFor(file, RUN)).toHaveLength(0);
  });
  it("reports the run site, the fix and where it is stated", () => {
    const [hit] = hitsFor(`${PROBE}/run/run-promise.ts`, RUN);
    expect(hit?.line).toBe(2);
    expect(hit?.message).toContain("Effect.runPromise");
    expect(hit?.message).toContain("runDomain");
    expect(hit?.message).toContain("conventions.md");
  });
});

describe("Effect try/tryPromise catch requirement (oxlint.config.ts)", () => {
  it.each(Object.keys(TRY_FAIL))("rejects %s", (name) => {
    expect(hitsFor(`${PROBE}/try/${name}.ts`, TRY)).toHaveLength(1);
  });
  it.each(Object.keys(TRY_PASS))("allows %s", (name) => {
    expect(hitsFor(`${PROBE}/try/${name}.ts`, TRY)).toHaveLength(0);
  });
  it.each(ROOTS)("covers the old root %s", (root) => {
    expect(hitsFor(`${root}/edge-probe.ts`, TRY)).toHaveLength(1);
  });
  it.each(OUT_OF_SCOPE)("ignores tests and non-roots: %s", (file) => {
    expect(hitsFor(file, TRY)).toHaveLength(0);
  });
  it("flags only the bare call when the next call carries a catch", () => {
    const hits = hitsFor(`${PROBE}/try/catch-belongs-to-other-call.ts`, TRY);
    expect(hits.map((h) => h.line)).toEqual([3]);
  });
  it("reports the message with the fix", () => {
    const [hit] = hitsFor(`${PROBE}/try/bare-try-promise.ts`, TRY);
    expect(hit?.line).toBe(2);
    expect(hit?.message).toContain("{ try, catch }");
    expect(hit?.message).toContain("conventions.md");
  });
});

describe("Effect language-service rules over the edge roots", () => {
  it.each(["api", "core"])(
    "rejects a catch returning unknown in packages/%s/src",
    (pkg) => {
      expect(
        hitsFor(`packages/${pkg}/src/lang/unknown-catch.ts`, UNKNOWN_CATCH)
      ).toHaveLength(1);
    }
  );
  it.each(["api", "core"])(
    "rejects run* inside an Effect in packages/%s/src",
    (pkg) => {
      expect(
        hitsFor(`packages/${pkg}/src/lang/run-inside-effect.ts`, RUN_INSIDE)
      ).toHaveLength(1);
    }
  );
  it("ignores tests", () => {
    expect(
      hitsFor(
        "packages/core/src/lang/__tests__/unknown-catch.ts",
        UNKNOWN_CATCH
      )
    ).toHaveLength(0);
  });
});
