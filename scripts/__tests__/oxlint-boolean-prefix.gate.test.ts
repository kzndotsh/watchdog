/**
 * Proves the real `oxlint.config.ts` requires boolean props, parameters and variables in
 * web code to be prefixed is/has/can/should (`watchdog/boolean-prefix`), and only where
 * the boolean is certain from syntax. The fixture starts with no baseline, so every
 * violation reports. Probe files are written into a throwaway repo that carries the real
 * config and plugin (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/boolean-prefix";
const SRC = "apps/web/src";
const DIR = `${SRC}/domains/cases/components`;
const BASELINE = "scripts/oxlint-plugin/baselines/boolean-prefix.json";

const createFixture = oxlintFixtureFactory();

let result: LintResult;
let baselined: LintResult;

const lines = (...rows: string[]) => `${rows.join("\n")}\n`;

/** Source plus the reported name and kind per finding, in source order. */
type Case = {
  readonly source: string;
  readonly found: readonly { readonly name: string; readonly kind: string }[];
};

const FAIL: Record<string, Case> = {
  "prop-boolean.tsx": {
    source: lines(
      "type BusyProps = { busy: boolean; label: string };",
      "export const x: BusyProps | null = null;"
    ),
    found: [{ name: "busy", kind: "prop" }],
  },
  "prop-optional-and-undefined.ts": {
    source: lines(
      "export type A = { loading?: boolean; pending: boolean | undefined };"
    ),
    found: [
      { name: "loading", kind: "prop" },
      { name: "pending", kind: "prop" },
    ],
  },
  "interface-member.ts": {
    source: lines("export interface A { mono: boolean }"),
    found: [{ name: "mono", kind: "prop" }],
  },
  "inline-props.tsx": {
    source: lines(
      "export function A({ live }: { live: boolean }) { return <i>{String(live)}</i>; }"
    ),
    found: [{ name: "live", kind: "prop" }],
  },
  "annotated-parameter.ts": {
    source: lines(
      "export function f(replace: boolean, ok: number) { return [replace, ok]; }",
      "export const g = (fill: boolean) => fill;"
    ),
    found: [
      { name: "replace", kind: "parameter" },
      { name: "fill", kind: "parameter" },
    ],
  },
  "annotated-variable.ts": {
    source: lines(
      "export const done: boolean = compute();",
      "declare function compute(): boolean;"
    ),
    found: [{ name: "done", kind: "variable" }],
  },
  "literal-initializer.ts": {
    source: lines("export const next = true;", "export let busy = false;"),
    found: [
      { name: "next", kind: "variable" },
      { name: "busy", kind: "variable" },
    ],
  },
  "negation-and-comparison.ts": {
    source: lines(
      "declare const v: unknown;",
      "declare const n: number;",
      "export const empty = !v;",
      "export const nonEmpty = !!v;",
      "export const same = n === 1;",
      "export const different = n !== 1;",
      "export const bigger = n > 1;",
      "export const hasher = 'a' in { a: 1 };",
      "export const isDate = v instanceof Date;"
    ),
    found: [
      { name: "empty", kind: "variable" },
      { name: "nonEmpty", kind: "variable" },
      { name: "same", kind: "variable" },
      { name: "different", kind: "variable" },
      { name: "bigger", kind: "variable" },
      { name: "hasher", kind: "variable" },
    ],
  },
  "use-state.tsx": {
    source: lines(
      'import { useState, useRef } from "react";',
      "export function A() {",
      "  const [editing, setEditing] = useState(false);",
      "  const [armed, setArmed] = useState<boolean>(compute());",
      "  const [count, setCount] = useState(0);",
      "  const mounted = useRef<boolean>(true);",
      "  const dirty = useRef(false);",
      "  return <i onClick={() => { setEditing(true); setArmed(true); setCount(1); }}>{String(editing)}{String(armed)}{count}{String(mounted)}{String(dirty)}</i>;",
      "}",
      "declare function compute(): boolean;"
    ),
    found: [
      { name: "editing", kind: "state" },
      { name: "armed", kind: "state" },
      { name: "mounted", kind: "state" },
      { name: "dirty", kind: "state" },
    ],
  },
  "react-namespace-hooks.tsx": {
    source: lines(
      'import * as React from "react";',
      "export function A() {",
      "  const [saving] = React.useState(false);",
      "  return <i>{String(saving)}</i>;",
      "}"
    ),
    found: [{ name: "saving", kind: "state" }],
  },
  "prefix-needs-word-boundary.ts": {
    source: lines(
      "export const island = true;",
      "export const hash = false;",
      "export const cancel = !island;"
    ),
    found: [
      { name: "island", kind: "variable" },
      { name: "hash", kind: "variable" },
      { name: "cancel", kind: "variable" },
    ],
  },
  "allowlist-names-are-props-only.ts": {
    source: lines(
      "export function f(open: boolean) { return open; }",
      "export const selected = true;",
      "export type P = { selected: boolean };"
    ),
    found: [
      { name: "open", kind: "parameter" },
      { name: "selected", kind: "variable" },
      { name: "selected", kind: "prop" },
    ],
  },
};

const OK: Record<string, string> = {
  "prefixed.ts": lines(
    "export type P = { isBusy: boolean; hasEvidence?: boolean; canSubmit: boolean; shouldFocus: boolean | undefined };",
    "export const isOn = true;",
    "export const hasAny = !0;",
    "export const canGo: boolean = go();",
    "export const _shouldSkip = false;",
    "declare function go(): boolean;"
  ),
  "contract-prop-allowlist.tsx": lines(
    "export type P = { disabled?: boolean; checked: boolean; defaultChecked?: boolean; open: boolean; defaultOpen?: boolean; required?: boolean; readOnly?: boolean; hidden?: boolean; multiple?: boolean; autoFocus?: boolean };",
    "export const x: P | null = null;"
  ),
  "uncertain-initializers.ts": lines(
    "declare const a: unknown;",
    "declare const b: unknown;",
    "declare function call(): boolean;",
    "export const both = a && b;",
    "export const either = a || b;",
    "export const maybe = a ?? b;",
    "export const picked = a ? true : false;",
    "export const result = call();",
    "export const wrapped = Boolean(a);"
  ),
  "non-boolean-types.ts": lines(
    "export type P = { busy: string; mode: 'a' | 'b'; flag: boolean | null; both: boolean | string; maybe?: Promise<boolean> };",
    "export function f(count: number, flag: boolean | null) { return [count, flag]; }",
    "export const label: string = 'x';"
  ),
  "unannotated-and-destructured.tsx": lines(
    "export function A({ busy, live }) { return <i>{String(busy)}{String(live)}</i>; }",
    "export const B = (busy) => busy;"
  ),
  "state-of-other-types.tsx": lines(
    'import { useState, useRef } from "react";',
    "export function A() {",
    "  const [count] = useState(0);",
    "  const [name] = useState('');",
    "  const [value] = useState<boolean | null>(null);",
    "  const [anything] = useState(call());",
    "  const el = useRef<HTMLDivElement>(null);",
    "  return <div ref={el}>{count}{name}{String(value)}{String(anything)}</div>;",
    "}",
    "declare function call(): boolean;"
  ),
  "setter-is-not-checked.tsx": lines(
    'import { useState } from "react";',
    "export function A() {",
    "  const [isEditing, setEditing] = useState(false);",
    "  return <i onClick={() => setEditing(true)}>{String(isEditing)}</i>;",
    "}"
  ),
  "constants.ts": lines(
    "export const ENABLED = true;",
    "export const MAX_RETRY_ON = false;"
  ),
  "computed-and-string-keys.ts": lines(
    "const key = 'k';",
    "export type P = { 'aria-busy': boolean; [key]: boolean };"
  ),
  "destructuring-targets.ts": lines(
    "declare const o: { a: unknown };",
    "export const { a } = o;"
  ),
};

beforeAll(() => {
  const fixture = createFixture();

  for (const [name, { source }] of Object.entries(FAIL)) {
    fixture.write(`${DIR}/${name}`, source);
  }
  for (const [name, source] of Object.entries(OK)) {
    fixture.write(`${DIR}/${name}`, source);
  }

  const bad = lines("export const busy = true;");
  fixture.write(`${SRC}/shared/lib/deep/er/bad.ts`, bad);
  fixture.write(`${SRC}/routes/bad.ts`, bad);
  fixture.write(`${SRC}/shared/ui/primitives/bad.ts`, bad);
  fixture.write(`${SRC}/auth/ui/bad.ts`, bad);
  fixture.write(`${DIR}/__tests__/bad.ts`, bad);
  fixture.write(`${DIR}/bad.test.ts`, bad);
  fixture.write(`${DIR}/bad.spec.tsx`, bad);
  fixture.write("packages/ui/src/bad.ts", bad);
  fixture.write("apps/web/e2e/bad.ts", bad);

  result = fixture.lint([SRC, "packages", "apps/web/e2e"]);

  const withBaseline = createFixture();
  withBaseline.write(`${DIR}/exact.ts`, bad);
  withBaseline.write(
    `${DIR}/grown.ts`,
    lines("export const busy = true;", "export const live = false;")
  );
  withBaseline.write(`${DIR}/stale.ts`, bad);
  withBaseline.write(`${DIR}/unlisted.ts`, bad);
  withBaseline.write(
    BASELINE,
    `${JSON.stringify({
      [`${DIR}/exact.ts`]: 1,
      [`${DIR}/grown.ts`]: 1,
      [`${DIR}/stale.ts`]: 2,
    })}\n`
  );
  baselined = withBaseline.lint([SRC]);
}, LINT_TIMEOUT_MS);

const hits = (file: string) => findingsFor(result, file, RULE);

const NAME = /Boolean (\w+) `(\w+)`/;
const summarize = (file: string) =>
  hits(file).map((f) => {
    const match = NAME.exec(f.message);
    return { name: match?.[2] ?? "", kind: match?.[1] ?? "" };
  });

describe("boolean prefix (boolean-prefix)", () => {
  it.each(Object.entries(FAIL))("rejects %s", (name, expected) => {
    expect(summarize(`${DIR}/${name}`)).toEqual(expected.found);
  });

  it("names the identifier, the kind, the fix and the convention", () => {
    const [hit] = hits(`${DIR}/prop-boolean.tsx`);
    expect(hit?.message).toContain("Boolean prop `busy`");
    expect(hit?.message).toContain("`isBusy`");
    expect(hit?.message).toContain(
      "conventions: boolean props and variables are prefixed is/has/can/should"
    );
  });

  it.each(Object.keys(OK))("allows %s", (name) => {
    expect(hits(`${DIR}/${name}`)).toHaveLength(0);
  });

  it("applies in shared/, routes/ and nested folders", () => {
    expect(hits(`${SRC}/shared/lib/deep/er/bad.ts`)).toHaveLength(1);
    expect(hits(`${SRC}/routes/bad.ts`)).toHaveLength(1);
  });

  it("exempts vendored primitives, auth/ui and tests", () => {
    expect(hits(`${SRC}/shared/ui/primitives/bad.ts`)).toHaveLength(0);
    expect(hits(`${SRC}/auth/ui/bad.ts`)).toHaveLength(0);
    expect(hits(`${DIR}/__tests__/bad.ts`)).toHaveLength(0);
    expect(hits(`${DIR}/bad.test.ts`)).toHaveLength(0);
    expect(hits(`${DIR}/bad.spec.tsx`)).toHaveLength(0);
  });

  it("ignores trees outside apps/web/src", () => {
    expect(hits("packages/ui/src/bad.ts")).toHaveLength(0);
    expect(hits("apps/web/e2e/bad.ts")).toHaveLength(0);
  });
});

describe("boolean-prefix baseline", () => {
  const baselinedHits = (file: string) =>
    findingsFor(baselined, `${DIR}/${file}`, RULE);

  it("passes a file whose violations equal its baseline count", () => {
    expect(baselinedHits("exact.ts")).toHaveLength(0);
  });

  it("fails only the violations beyond the baselined count", () => {
    const hit = baselinedHits("grown.ts");
    expect(hit).toHaveLength(1);
    expect(hit[0]?.message).toContain("`live`");
    expect(hit[0]?.message).toContain("allows 1");
  });

  it("fails a stale entry whose file no longer has that many", () => {
    const hit = baselinedHits("stale.ts");
    expect(hit).toHaveLength(1);
    expect(hit[0]?.message).toContain("Stale baseline entry");
  });

  it("fails a file the baseline does not list", () => {
    const hit = baselinedHits("unlisted.ts");
    expect(hit).toHaveLength(1);
    expect(hit[0]?.message).toContain("allows 0");
  });
});
