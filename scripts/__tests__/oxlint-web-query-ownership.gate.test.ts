/**
 * Proves the real `oxlint.config.ts` keeps TanStack Query ownership in the right files in
 * apps/web: `useMutation` only in hooks, QueryClient cache writes only in hooks and
 * `shared/lib/query-invalidation.ts`, query keys only in queries modules. Probe files are
 * written into a throwaway repo that carries the real config and plugin
 * (helpers/oxlint-fixture.ts); the baseline files are the real ones, so every probe path
 * is new and unlisted.
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  findingsFor,
  LINT_TIMEOUT_MS,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const MUTATION = "watchdog/mutation-only-in-hooks";
const CACHE = "watchdog/cache-writes-only-in-hooks";
const KEYS = "watchdog/query-keys-in-queries-modules";

const SRC = "apps/web/src";
const COMPONENTS = `${SRC}/domains/probe/components`;

const createFixture = oxlintFixtureFactory();

let result: LintResult;

const RQ = 'import { useMutation } from "@tanstack/react-query";\n';

const MUTATION_FAIL = {
  "named.tsx": `${RQ}export const useX = () => useMutation({ mutationFn: async () => 1 });\n`,
  "aliased.tsx":
    'import { useMutation as useM } from "@tanstack/react-query";\nexport const x = () => useM({ mutationFn: async () => 1 });\n',
  "namespace.tsx":
    'import * as rq from "@tanstack/react-query";\nexport const x = () => rq.useMutation({ mutationFn: async () => 1 });\n',
  "namespace-computed.tsx":
    'import * as rq from "@tanstack/react-query";\nexport const x = () => rq["useMutation"]({ mutationFn: async () => 1 });\n',
  "use-before-import.tsx": `export const x = () => useMutation({ mutationFn: async () => 1 });\n${RQ}`,
  "in-component.tsx": `${RQ}export function Panel() {\n  const m = useMutation({ mutationFn: async () => 1 });\n  return <button onClick={() => m.mutate()} />;\n}\n`,
} as const;

const CACHE_FAIL = {
  "invalidate.tsx":
    "export const f = (qc: any) => qc.invalidateQueries({ queryKey: [] });\n",
  "optional.tsx":
    "export const f = (qc?: any) => qc?.invalidateQueries({ queryKey: [] });\n",
  "set-data.tsx": "export const f = (qc: any) => qc.setQueryData([], 1);\n",
  "set-queries-data.tsx":
    "export const f = (qc: any) => qc.setQueriesData({}, 1);\n",
  "remove.tsx": "export const f = (qc: any) => qc.removeQueries();\n",
  "reset.tsx": "export const f = (qc: any) => qc.resetQueries();\n",
  "refetch.tsx": "export const f = (qc: any) => qc.refetchQueries();\n",
  "cancel.tsx": "export const f = (qc: any) => qc.cancelQueries();\n",
  "computed.tsx":
    'export const f = (qc: any) => qc["invalidateQueries"]({ queryKey: [] });\n',
  "template-computed.tsx":
    "export const f = (qc: any) => qc[`invalidateQueries`]({ queryKey: [] });\n",
  "bound.tsx": "export const f = (qc: any) => qc.invalidateQueries.bind(qc);\n",
  "call.tsx":
    "export const f = (qc: any) => qc.invalidateQueries.call(qc, {});\n",
  "destructured.tsx":
    "export const f = (qc: any) => {\n  const { invalidateQueries } = qc;\n  return invalidateQueries;\n};\n",
  "destructured-alias.tsx":
    "export const f = (qc: any) => {\n  const { setQueryData: put } = qc;\n  return put;\n};\n",
  "chained.tsx":
    "export const f = (c: { qc: any }) => c.qc.invalidateQueries({});\n",
} as const;

const KEYS_FAIL = {
  "inline-key.ts":
    'export const o = { queryKey: ["organization", "member-role"], queryFn: async () => 1 };\n',
  "inline-key-as-const.ts":
    'export const o = { queryKey: ["a", 1] as const };\n',
  "inline-key-string-prop.ts": 'export const o = { "queryKey": ["a"] };\n',
  "keys-object.ts":
    'export const fooKeys = {\n  all: ["foo"] as const,\n  one: (id: string) => ["foo", id] as const,\n};\n',
  "keys-object-fn-only.ts":
    'export const fooKeys = { one: (id: string) => ["foo", id] };\n',
  "keys-object-block.ts":
    'export const fooKeys = { one(id: string) { return ["foo", id]; } };\n',
  "const-query-key.ts":
    'const USERS_QUERY_KEY = ["auth-admin", "users"] as const;\nexport const u = USERS_QUERY_KEY;\n',
  "const-key.ts":
    'const INVITATIONS_KEY = ["auth-org", "user-invitations"] as const;\nexport const u = INVITATIONS_KEY;\n',
  "const-camel-query-key.ts":
    "export const f = (id: string) => {\n  const previewQueryKey = [`preview`, id] as const;\n  return previewQueryKey;\n};\n",
  "key-fn.ts":
    'export const fooQueryKey = (id: string) => ["foo", id] as const;\n',
  "key-fn-decl.ts":
    'export function fooKey(id: string) {\n  return ["foo", id];\n}\n',
} as const;

beforeAll(() => {
  const fixture = createFixture();

  for (const [name, source] of Object.entries(MUTATION_FAIL)) {
    fixture.write(`${COMPONENTS}/m-${name}`, source);
  }
  fixture.write(
    `${COMPONENTS}/m-shadowed.tsx`,
    `${RQ}export const f = (useMutation: (o: object) => void) => useMutation({});\n`
  );
  fixture.write(
    `${COMPONENTS}/m-other-module.tsx`,
    'import { useMutation } from "./local";\nexport const x = () => useMutation({});\n'
  );
  fixture.write(
    `${COMPONENTS}/m-unimported.tsx`,
    "declare const useMutation: (o: object) => void;\nexport const x = () => useMutation({});\n"
  );
  fixture.write(
    `${COMPONENTS}/m-no-call.tsx`,
    `${RQ}export const type = typeof useMutation;\n`
  );
  fixture.write(
    `${SRC}/domains/probe/hooks/use-thing.ts`,
    `${RQ}export const useThing = () => useMutation({ mutationFn: async () => 1 });\n`
  );
  fixture.write(
    `${SRC}/shared/hooks/use-thing.ts`,
    `${RQ}export const useThing = () => useMutation({ mutationFn: async () => 1 });\n`
  );
  fixture.write(
    `${SRC}/domains/probe/hooks/nested/use-thing.ts`,
    `${RQ}export const useThing = () => useMutation({ mutationFn: async () => 1 });\n`
  );
  fixture.write(
    `${SRC}/domains/probe/lib/use-thing.ts`,
    `${RQ}export const useThing = () => useMutation({ mutationFn: async () => 1 });\n`
  );
  fixture.write(
    `${SRC}/domains/probe/__tests__/thing.test.tsx`,
    `${RQ}export const useThing = () => useMutation({ mutationFn: async () => 1 });\n`
  );
  fixture.write(
    "packages/core/src/probe/use-thing.ts",
    `${RQ}export const useThing = () => useMutation({ mutationFn: async () => 1 });\n`
  );

  for (const [name, source] of Object.entries(CACHE_FAIL)) {
    fixture.write(`${COMPONENTS}/c-${name}`, source);
  }
  fixture.write(
    `${COMPONENTS}/c-near-miss.tsx`,
    [
      "export const a = (qc: any) => qc.getQueryData([]);",
      "export const b = (qc: any) => qc.invalidate();",
      "export const c = (qc: any) => qc.ensureQueryData({});",
      "export const d = (q: any) => q.setData(1);",
      "export const invalidateQueries = () => 1;",
      "export const e = invalidateQueries();",
      "const { fetchQuery } = { fetchQuery: 1 };",
      "export const f = fetchQuery;",
      "",
    ].join("\n")
  );
  fixture.write(
    `${SRC}/domains/probe/hooks/use-write.ts`,
    "export const f = (qc: any) => qc.invalidateQueries({});\n"
  );
  fixture.write(
    `${SRC}/shared/hooks/use-write.ts`,
    "export const f = (qc: any) => qc.setQueryData([], 1);\n"
  );
  fixture.write(
    `${SRC}/shared/lib/query-invalidation.ts`,
    "export const f = (qc: any) => qc.invalidateQueries({});\n"
  );
  fixture.write(
    `${SRC}/shared/lib/other-invalidation.ts`,
    "export const f = (qc: any) => qc.invalidateQueries({});\n"
  );
  fixture.write(
    `${SRC}/domains/probe/lib/write.ts`,
    "export const f = (qc: any) => qc.setQueryData([], 1);\n"
  );
  fixture.write(
    `${SRC}/routes/write.tsx`,
    "export const f = (qc: any) => qc.setQueryData([], 1);\n"
  );
  fixture.write(
    `${SRC}/domains/probe/__tests__/write.test.tsx`,
    "export const f = (qc: any) => qc.invalidateQueries({});\n"
  );
  fixture.write(
    "packages/core/src/probe/write.ts",
    "export const f = (qc: any) => qc.invalidateQueries({});\n"
  );

  for (const [name, source] of Object.entries(KEYS_FAIL)) {
    fixture.write(`${COMPONENTS}/k-${name}`, source);
  }
  fixture.write(
    `${COMPONENTS}/k-near-miss.ts`,
    [
      'import { fooKeys } from "@/domains/probe/queries";',
      "export const a = { queryKey: fooKeys.all };",
      'export const b = { queryKey: fooKeys.one("x") };',
      'export const STORAGE_KEY = "theme";',
      'export const sortKeys = ["a", "b"] as const;',
      'export const API_KEY = "x";',
      "export const primaryKey = (row: { id: string }) => row.id;",
      "export const keyOf = (id: string) => id.toUpperCase();",
      "export const c = { queryKey: someKey };",
      "declare const someKey: readonly unknown[];",
      "export const labelKeys = { a: 1, b: 2 };",
      "export const d = { key: [1, 2] };",
      "",
    ].join("\n")
  );
  const queriesSource =
    'export const fooKeys = { all: ["foo"] as const, one: (id: string) => ["foo", id] as const };\nexport const o = { queryKey: ["foo", "inline"] as const };\nexport const USERS_QUERY_KEY = ["u"] as const;\n';
  fixture.write(`${SRC}/domains/probe/queries.ts`, queriesSource);
  fixture.write(`${SRC}/domains/probe/sub/queries.ts`, queriesSource);
  fixture.write(`${SRC}/domains/probe/artifact-queries.ts`, queriesSource);
  fixture.write(`${SRC}/domains/probe/jobs-keys.ts`, queriesSource);
  fixture.write(`${SRC}/shared/lib/queries.ts`, queriesSource);
  fixture.write(`${SRC}/domains/probe/queries.tsx`, queriesSource);
  fixture.write(`${SRC}/domains/probe/my-queries-helper.ts`, queriesSource);
  fixture.write(`${SRC}/domains/probe/__tests__/keys.test.ts`, queriesSource);
  fixture.write("packages/core/src/probe/keys.ts", queriesSource);

  result = fixture.lint([SRC, "packages"]);
}, LINT_TIMEOUT_MS);

const hits = (file: string, rule: string) => findingsFor(result, file, rule);

describe("useMutation only in hooks (mutation-only-in-hooks)", () => {
  it.each(Object.keys(MUTATION_FAIL))("rejects %s", (name) => {
    expect(hits(`${COMPONENTS}/m-${name}`, MUTATION)).toHaveLength(1);
  });
  it("names the hook folder and the conventions entry, on the right line", () => {
    const [hit] = hits(`${COMPONENTS}/m-in-component.tsx`, MUTATION);
    expect(hit?.message).toContain("domains/<domain>/hooks/");
    expect(hit?.message).toContain(
      "mutations and invalidation only in domain hooks"
    );
    expect(hit?.line).toBe(3);
  });
  it("allows a shadowed name, another module's useMutation and a bare reference", () => {
    expect(hits(`${COMPONENTS}/m-shadowed.tsx`, MUTATION)).toHaveLength(0);
    expect(hits(`${COMPONENTS}/m-other-module.tsx`, MUTATION)).toHaveLength(0);
    expect(hits(`${COMPONENTS}/m-unimported.tsx`, MUTATION)).toHaveLength(0);
    expect(hits(`${COMPONENTS}/m-no-call.tsx`, MUTATION)).toHaveLength(0);
  });
  it("allows domain hooks, shared hooks and nested hook folders", () => {
    expect(
      hits(`${SRC}/domains/probe/hooks/use-thing.ts`, MUTATION)
    ).toHaveLength(0);
    expect(hits(`${SRC}/shared/hooks/use-thing.ts`, MUTATION)).toHaveLength(0);
    expect(
      hits(`${SRC}/domains/probe/hooks/nested/use-thing.ts`, MUTATION)
    ).toHaveLength(0);
  });
  it("rejects a hook that lives in a domain lib folder", () => {
    expect(
      hits(`${SRC}/domains/probe/lib/use-thing.ts`, MUTATION)
    ).toHaveLength(1);
  });
  it("exempts tests and trees outside apps/web", () => {
    expect(
      hits(`${SRC}/domains/probe/__tests__/thing.test.tsx`, MUTATION)
    ).toHaveLength(0);
    expect(hits("packages/core/src/probe/use-thing.ts", MUTATION)).toHaveLength(
      0
    );
  });
});

describe("cache writes only in hooks (cache-writes-only-in-hooks)", () => {
  it.each(Object.keys(CACHE_FAIL))("rejects %s", (name) => {
    expect(hits(`${COMPONENTS}/c-${name}`, CACHE)).toHaveLength(1);
  });
  it("names the allowed places and the conventions entry, on the right line", () => {
    const [hit] = hits(`${COMPONENTS}/c-destructured.tsx`, CACHE);
    expect(hit?.message).toContain("invalidateQueries");
    expect(hit?.message).toContain("shared/lib/query-invalidation.ts");
    expect(hit?.message).toContain(
      "mutations and invalidation only in domain hooks"
    );
    expect(hit?.line).toBe(2);
  });
  it("allows reads, other members and same-named local functions", () => {
    expect(hits(`${COMPONENTS}/c-near-miss.tsx`, CACHE)).toHaveLength(0);
  });
  it("allows domain hooks, shared hooks and query-invalidation.ts", () => {
    expect(hits(`${SRC}/domains/probe/hooks/use-write.ts`, CACHE)).toHaveLength(
      0
    );
    expect(hits(`${SRC}/shared/hooks/use-write.ts`, CACHE)).toHaveLength(0);
    expect(hits(`${SRC}/shared/lib/query-invalidation.ts`, CACHE)).toHaveLength(
      0
    );
  });
  it("rejects other shared/lib files, domain libs and routes", () => {
    expect(hits(`${SRC}/shared/lib/other-invalidation.ts`, CACHE)).toHaveLength(
      1
    );
    expect(hits(`${SRC}/domains/probe/lib/write.ts`, CACHE)).toHaveLength(1);
    expect(hits(`${SRC}/routes/write.tsx`, CACHE)).toHaveLength(1);
  });
  it("exempts tests and trees outside apps/web", () => {
    expect(
      hits(`${SRC}/domains/probe/__tests__/write.test.tsx`, CACHE)
    ).toHaveLength(0);
    expect(hits("packages/core/src/probe/write.ts", CACHE)).toHaveLength(0);
  });
});

describe("query keys only in queries modules (query-keys-in-queries-modules)", () => {
  it.each(Object.keys(KEYS_FAIL))("rejects %s", (name) => {
    expect(hits(`${COMPONENTS}/k-${name}`, KEYS)).toHaveLength(1);
  });
  it("names the queries module and the conventions entry, on the right line", () => {
    const [hit] = hits(`${COMPONENTS}/k-keys-object.ts`, KEYS);
    expect(hit?.message).toContain("queries.ts");
    expect(hit?.message).toContain("query keys only in queries modules");
    expect(hit?.line).toBe(1);
  });
  it("allows calling a factory, ordinary *_KEY constants and non-key arrays", () => {
    expect(hits(`${COMPONENTS}/k-near-miss.ts`, KEYS)).toHaveLength(0);
  });
  it("allows queries.ts, *-queries.ts and *-keys.ts at any depth", () => {
    for (const file of [
      `${SRC}/domains/probe/queries.ts`,
      `${SRC}/domains/probe/sub/queries.ts`,
      `${SRC}/domains/probe/artifact-queries.ts`,
      `${SRC}/domains/probe/jobs-keys.ts`,
      `${SRC}/shared/lib/queries.ts`,
    ]) {
      expect(hits(file, KEYS)).toHaveLength(0);
    }
  });
  it("rejects look-alike file names", () => {
    expect(
      hits(`${SRC}/domains/probe/queries.tsx`, KEYS).length
    ).toBeGreaterThan(0);
    expect(
      hits(`${SRC}/domains/probe/my-queries-helper.ts`, KEYS).length
    ).toBeGreaterThan(0);
  });
  it("exempts tests and trees outside apps/web", () => {
    expect(
      hits(`${SRC}/domains/probe/__tests__/keys.test.ts`, KEYS)
    ).toHaveLength(0);
    expect(hits("packages/core/src/probe/keys.ts", KEYS)).toHaveLength(0);
  });
});
