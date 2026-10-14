/**
 * Proves the real `oxlint.config.ts` enforces the mock policy in tests
 * (docs/contributing/testing/standards.md): no `vi.mock` of an internal module
 * (`watchdog/no-internal-module-mock`), no `as never` / `as unknown as T` cast
 * (`watchdog/no-test-casts`), no real sleep (`watchdog/no-test-sleep`), each with a
 * shrink-only baseline. Probe files are written into a throwaway repo that carries the
 * real config and plugin (helpers/oxlint-fixture.ts); production files are never linted.
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const MOCK = "watchdog/no-internal-module-mock";
const CASTS = "watchdog/no-test-casts";
const SLEEP = "watchdog/no-test-sleep";
const DIR = "apps/web/src/domains/probe/__tests__";
const BASELINE_DIR = "scripts/oxlint-plugin/baselines";

const createFixture = oxlintFixtureFactory();

let result: LintResult;
let baselined: LintResult;

const lines = (...rows: string[]) => `${rows.join("\n")}\n`;
const HEAD = 'import { vi } from "vitest";';

/** Probe file -> number of findings of the rule it targets. */
const MOCK_FAIL: Record<string, string> = {
  "mock-relative.test.ts": lines(HEAD, 'vi.mock("../thing", () => ({}));'),
  "mock-parent.test.ts": lines(
    HEAD,
    'vi.mock("../../lib/thing.ts", () => ({}));'
  ),
  "mock-alias.test.ts": lines(
    HEAD,
    'vi.mock("@/shared/lib/query-invalidation", () => ({}));'
  ),
  "mock-do.test.ts": lines(
    HEAD,
    'vi.doMock("@/domains/jobs/queries", () => ({}));'
  ),
  "mock-template.test.ts": lines(
    HEAD,
    "vi.mock(`@/domains/jobs/queries`, () => ({}));"
  ),
  "mock-query-hook.test.ts": lines(
    HEAD,
    'vi.mock("@/domains/jobs/hooks/use-jobs-workspace", () => ({}));'
  ),
};

const MOCK_OK: Record<string, string> = {
  "boundary-functions.test.ts": lines(
    HEAD,
    'vi.mock("@/domains/jobs/jobs.functions", () => ({}));'
  ),
  "boundary-functions-ts.test.ts": lines(
    HEAD,
    'vi.mock("./claims.functions.ts", () => ({}));'
  ),
  "boundary-auth.test.ts": lines(
    HEAD,
    'vi.mock("@/auth/client", () => ({}));',
    'vi.mock("@/auth/server", () => ({}));'
  ),
  "boundary-toast.test.ts": lines(
    HEAD,
    'vi.mock("@/shared/ui/toast", () => ({}));'
  ),
  "package.test.ts": lines(
    HEAD,
    'vi.mock("@watchdog/core/cases", () => ({}));',
    'vi.mock("@tanstack/react-router", () => ({}));',
    'vi.mock("node:fs", () => ({}));'
  ),
  "not-vi.test.ts": lines(
    "declare const other: { mock: (s: string) => void };",
    'other.mock("../thing");'
  ),
  "dynamic-specifier.test.ts": lines(
    HEAD,
    "declare const s: string;",
    "vi.mock(s, () => ({}));"
  ),
};

const CAST_FAIL: Record<string, { source: string; count: number }> = {
  "as-never.test.ts": {
    source: lines("declare function f(x: string): void;", "f(1 as never);"),
    count: 1,
  },
  "as-unknown-as.test.ts": {
    source: lines(
      "type A = { a: number };",
      "export const a = { b: 1 } as unknown as A;"
    ),
    count: 1,
  },
  "both.test.ts": {
    source: lines(
      "type A = { a: number };",
      "export const a = [{ b: 1 } as unknown as A, 2 as never];"
    ),
    count: 2,
  },
};

const CAST_OK: Record<string, string> = {
  "as-const.test.ts": lines('export const a = ["x"] as const;'),
  "as-type.test.ts": lines("export const a = { n: 1 } as { n: number };"),
  "as-unknown-only.test.ts": lines("export const a = { n: 1 } as unknown;"),
  "satisfies.test.ts": lines(
    "export const a = { n: 1 } satisfies { n: number };"
  ),
};

const SLEEP_FAIL: Record<string, { source: string; count: number }> = {
  "set-timeout.test.ts": {
    source: lines("export const w = new Promise((r) => setTimeout(r, 50));"),
    count: 1,
  },
  "global-set-timeout.test.ts": {
    source: lines(
      "export const w = new Promise((r) => globalThis.setTimeout(r, 50));"
    ),
    count: 1,
  },
  "sleep-helper.test.ts": {
    source: lines(
      "declare function sleep(ms: number): Promise<void>;",
      "declare function delay(ms: number): Promise<void>;",
      "export const run = async () => { await sleep(100); await delay(5); };"
    ),
    count: 2,
  },
};

const SLEEP_OK: Record<string, string> = {
  "fake-timers.test.ts": lines(
    HEAD,
    "vi.useFakeTimers();",
    "vi.advanceTimersByTime(100);",
    "vi.useRealTimers();"
  ),
  "effect-sleep.test.ts": lines(
    'import { Effect } from "effect";',
    "export const e = Effect.sleep(100);"
  ),
  "member-named-sleep.test.ts": lines(
    "declare const clock: { sleep: (n: number) => void };",
    "clock.sleep(1);"
  ),
};

beforeAll(() => {
  const fixture = createFixture();
  for (const [name, source] of Object.entries(MOCK_FAIL)) {
    fixture.write(`${DIR}/${name}`, source);
  }
  for (const [name, source] of Object.entries(MOCK_OK)) {
    fixture.write(`${DIR}/${name}`, source);
  }
  for (const [name, { source }] of Object.entries(CAST_FAIL)) {
    fixture.write(`${DIR}/${name}`, source);
  }
  for (const [name, source] of Object.entries(CAST_OK)) {
    fixture.write(`${DIR}/${name}`, source);
  }
  for (const [name, { source }] of Object.entries(SLEEP_FAIL)) {
    fixture.write(`${DIR}/${name}`, source);
  }
  for (const [name, source] of Object.entries(SLEEP_OK)) {
    fixture.write(`${DIR}/${name}`, source);
  }

  // Applies in every test tree (packages, scripts, helpers under __tests__), not in production.
  const mockSource = lines(HEAD, 'vi.mock("./thing", () => ({}));');
  fixture.write("packages/core/src/__tests__/x.test.ts", mockSource);
  fixture.write("packages/core/src/__tests__/helpers/y.ts", mockSource);
  fixture.write("packages/core/src/x.spec.ts", mockSource);
  fixture.write("apps/worker/src/prod.ts", mockSource);

  result = fixture.lint(["apps", "packages"]);

  const withBaseline = createFixture();
  const baselineSources = {
    "exact.test.ts": lines(
      HEAD,
      'vi.mock("./a", () => ({}));',
      "export const c = 1 as never;",
      "export const s = setTimeout(() => {}, 1);"
    ),
    "grown.test.ts": lines(
      HEAD,
      'vi.mock("./a", () => ({}));',
      'vi.mock("./b", () => ({}));',
      "export const c = [1 as never, 2 as never];",
      "export const s = [setTimeout(() => {}, 1), setTimeout(() => {}, 2)];"
    ),
    "stale.test.ts": lines(
      HEAD,
      'vi.mock("./a", () => ({}));',
      "export const c = 1 as never;",
      "export const s = setTimeout(() => {}, 1);"
    ),
    "unlisted.test.ts": lines(
      HEAD,
      'vi.mock("./a", () => ({}));',
      "export const c = 1 as never;",
      "export const s = setTimeout(() => {}, 1);"
    ),
  };
  for (const [name, source] of Object.entries(baselineSources)) {
    withBaseline.write(`${DIR}/${name}`, source);
  }
  const entries = (counts: { exact: number; grown: number; stale: number }) =>
    `${JSON.stringify({
      [`${DIR}/exact.test.ts`]: counts.exact,
      [`${DIR}/grown.test.ts`]: counts.grown,
      [`${DIR}/stale.test.ts`]: counts.stale,
    })}\n`;
  withBaseline.write(
    `${BASELINE_DIR}/no-internal-module-mock.json`,
    entries({ exact: 1, grown: 1, stale: 3 })
  );
  withBaseline.write(
    `${BASELINE_DIR}/no-test-casts.json`,
    entries({ exact: 1, grown: 1, stale: 3 })
  );
  withBaseline.write(
    `${BASELINE_DIR}/no-test-sleep.json`,
    entries({ exact: 1, grown: 1, stale: 3 })
  );
  baselined = withBaseline.lint([DIR]);
}, LINT_TIMEOUT_MS);

const hits = (file: string, rule: string) =>
  findingsFor(result, `${DIR}/${file}`, rule);

describe("no-internal-module-mock", () => {
  it.each(Object.keys(MOCK_FAIL))("rejects %s", (name) => {
    expect(hits(name, MOCK)).toHaveLength(1);
  });

  it("names the module, the fix and the policy", () => {
    const [hit] = hits("mock-alias.test.ts", MOCK);
    expect(hit?.message).toContain('"@/shared/lib/query-invalidation"');
    expect(hit?.message).toContain("fake the boundary");
    expect(hit?.message).toContain("Mock policy");
  });

  it.each(Object.keys(MOCK_OK))("allows %s", (name) => {
    expect(hits(name, MOCK)).toHaveLength(0);
  });

  it("applies in every test tree and never to production files", () => {
    const at = (file: string) => findingsFor(result, file, MOCK);
    expect(at("packages/core/src/__tests__/x.test.ts")).toHaveLength(1);
    expect(at("packages/core/src/__tests__/helpers/y.ts")).toHaveLength(1);
    expect(at("packages/core/src/x.spec.ts")).toHaveLength(1);
    expect(at("apps/worker/src/prod.ts")).toHaveLength(0);
  });
});

describe("no-test-casts", () => {
  it.each(Object.entries(CAST_FAIL))("rejects %s", (name, { count }) => {
    expect(hits(name, CASTS)).toHaveLength(count);
  });

  it("names the cast and the fix", () => {
    const [hit] = hits("as-never.test.ts", CASTS);
    expect(hit?.message).toContain("`as never`");
    expect(hit?.message).toContain("untrusted*");
  });

  it.each(Object.keys(CAST_OK))("allows %s", (name) => {
    expect(hits(name, CASTS)).toHaveLength(0);
  });
});

describe("no-test-sleep", () => {
  it.each(Object.entries(SLEEP_FAIL))("rejects %s", (name, { count }) => {
    expect(hits(name, SLEEP)).toHaveLength(count);
  });

  it("names the wait and the alternatives", () => {
    const [hit] = hits("set-timeout.test.ts", SLEEP);
    expect(hit?.message).toContain("setTimeout()");
    expect(hit?.message).toContain("fake timers");
  });

  it.each(Object.keys(SLEEP_OK))("allows %s", (name) => {
    expect(hits(name, SLEEP)).toHaveLength(0);
  });
});

describe.each([MOCK, CASTS, SLEEP])("%s baseline", (rule) => {
  const at = (file: string) => findingsFor(baselined, `${DIR}/${file}`, rule);

  it("passes a file at its baselined count", () => {
    expect(at("exact.test.ts")).toHaveLength(0);
  });

  it("fails only the violations beyond the baselined count", () => {
    const hit = at("grown.test.ts");
    expect(hit).toHaveLength(1);
    expect(hit[0]?.message).toContain("new violation");
  });

  it("fails a stale entry so the baseline only shrinks", () => {
    const hit = at("stale.test.ts");
    expect(hit).toHaveLength(1);
    expect(hit[0]?.message).toContain("Stale baseline entry");
  });

  it("fails a file the baseline does not list", () => {
    const hit = at("unlisted.test.ts");
    expect(hit).toHaveLength(1);
    expect(hit[0]?.message).toContain("allows 0");
  });
});
