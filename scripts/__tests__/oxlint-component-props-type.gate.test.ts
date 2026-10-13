/**
 * Proves the real `oxlint.config.ts` requires a named `XProps` type for a web component
 * with more than two props (`watchdog/component-props-type`). The fixture starts with no
 * baseline, so every inline literal of three or more members reports. Probe files are
 * written into a throwaway repo that carries the real config and plugin
 * (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/component-props-type";
const SRC = "apps/web/src";
const DIR = `${SRC}/domains/cases/components`;
const BASELINE = "scripts/oxlint-plugin/baselines/component-props-type.json";

const createFixture = oxlintFixtureFactory();

let result: LintResult;
let baselined: LintResult;

const lines = (...rows: string[]) => `${rows.join("\n")}\n`;

/** Source plus the 1-based line the component is reported on. */
type Case = { readonly source: string; readonly line: number };

const FAIL: Record<string, Case> = {
  "function-declaration.tsx": {
    source: lines(
      "export function A({ a, b, c }: { a: string; b: number; c: boolean }) {",
      "  return <div>{a}{b}{String(c)}</div>;",
      "}"
    ),
    line: 1,
  },
  "arrow.tsx": {
    source: lines(
      "export const A = (props: { a: string; b: number; c: boolean }) => <div />;"
    ),
    line: 1,
  },
  "function-expression.tsx": {
    source: lines(
      "export const A = function (p: { a: 1; b: 2; c: 3 }) { return <div />; };"
    ),
    line: 1,
  },
  "memo-arrow.tsx": {
    source: lines(
      'import { memo } from "react";',
      "export const A = memo(({ a }: { a: 1; b: 2; c: 3 }) => <div>{a}</div>);"
    ),
    line: 2,
  },
  "forward-ref.tsx": {
    source: lines(
      'import { forwardRef } from "react";',
      "export const A = forwardRef(function A(p: { a: 1; b: 2; c: 3 }, ref) {",
      "  return <div ref={ref} />;",
      "});"
    ),
    line: 2,
  },
  "private-component.tsx": {
    source: lines(
      "function Helper(p: { a: 1; b: 2; c: 3 }) { return <i />; }",
      "export function A() { return <Helper a={1} b={2} c={3} />; }"
    ),
    line: 1,
  },
  "default-export.tsx": {
    source: lines(
      "export default function A(p: { a: 1; b: 2; c: 3 }) { return <div />; }"
    ),
    line: 1,
  },
  "optional-and-method-members.tsx": {
    source: lines(
      "export function A(p: { a?: 1; onB: () => void; readonly c: 3 }) { return <div />; }"
    ),
    line: 1,
  },
  "memo-local-lowercase-impl.tsx": {
    source: lines(
      'import { memo } from "react";',
      "function impl(p: { a: 1; b: 2; c: 3 }) { return <div />; }",
      "export const A = memo(impl);"
    ),
    line: 3,
  },
  "forward-ref-local-const-impl.tsx": {
    source: lines(
      'import { forwardRef } from "react";',
      "const impl = (p: { a: 1; b: 2; c: 3 }, ref: unknown) => <div />;",
      "export const A = forwardRef(impl);"
    ),
    line: 3,
  },
  "declared-and-wrapped-reports-once.tsx": {
    source: lines(
      'import { memo } from "react";',
      "function Base(p: { a: 1; b: 2; c: 3 }) { return <div />; }",
      "export const Wrapped = memo(Base);"
    ),
    line: 2,
  },
};

const OK: Record<string, string> = {
  "memo-local-impl-named.tsx": lines(
    'import { memo } from "react";',
    "type AProps = { a: 1; b: 2; c: 3 };",
    "function impl(p: AProps) { return <div />; }",
    "export const A = memo(impl);"
  ),
  "memo-local-impl-two-props.tsx": lines(
    'import { memo } from "react";',
    "function impl(p: { a: 1; b: 2 }) { return <div />; }",
    "export const A = memo(impl);"
  ),
  "memo-imported-impl.tsx": lines(
    'import { memo } from "react";',
    'import { impl } from "./impl";',
    "export const A = memo(impl);"
  ),
  "named-props.tsx": lines(
    "type AProps = { a: 1; b: 2; c: 3; d: 4 };",
    "export function A(p: AProps) { return <div />; }"
  ),
  "destructured-named.tsx": lines(
    "type AProps = { a: 1; b: 2; c: 3 };",
    "export const A = ({ a, b, c }: AProps) => <div>{a}{b}{c}</div>;"
  ),
  "imported-type.tsx": lines(
    'import type { Shared } from "./shared";',
    "export function A(p: Shared) { return <div />; }"
  ),
  "component-props-reference.tsx": lines(
    'import type { ComponentProps } from "react";',
    'export function A(p: ComponentProps<"div">) { return <div {...p} />; }'
  ),
  "intersection.tsx": lines(
    "type Base = { a: 1 };",
    "export function A(p: Base & { b: 2; c: 3; d: 4 }) { return <div />; }"
  ),
  "two-inline-props.tsx": lines(
    "export function A({ a, b }: { a: string; b: number }) {",
    "  return <div>{a}{b}</div>;",
    "}"
  ),
  "one-inline-prop.tsx": lines(
    "export const A = ({ a }: { a: string }) => <div>{a}</div>;"
  ),
  "no-annotation.tsx": lines(
    "export const A = ({ a, b, c }) => <div>{a}{b}{c}</div>;"
  ),
  "memo-named.tsx": lines(
    'import { memo } from "react";',
    "type AProps = { a: 1; b: 2; c: 3 };",
    "export const A = memo((p: AProps) => <div />);"
  ),
  "non-component-functions.tsx": lines(
    "export function helper(p: { a: 1; b: 2; c: 3 }) { return p; }",
    "export const makeThing = (p: { a: 1; b: 2; c: 3 }) => p;",
    "export const MAX_ROWS = (p: { a: 1; b: 2; c: 3 }) => p;",
    "export const useThing = (p: { a: 1; b: 2; c: 3 }) => p;",
    "export function A() { return <div />; }"
  ),
  "second-parameter-is-not-props.tsx": lines(
    "type AProps = { a: 1 };",
    "export function A(p: AProps, extra: { a: 1; b: 2; c: 3 }) { return <div />; }"
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

  const bad = FAIL["function-declaration.tsx"]?.source ?? "";
  fixture.write(`${DIR}/not-tsx.ts`, "export const x = 1;\n");
  fixture.write(`${SRC}/shared/ui/deep/er/bad.tsx`, bad);
  fixture.write(`${SRC}/routes/bad.tsx`, bad);
  fixture.write(`${DIR}/__tests__/bad.tsx`, bad);
  fixture.write(`${DIR}/bad.test.tsx`, bad);
  fixture.write(`${DIR}/bad.spec.tsx`, bad);
  fixture.write("packages/ui/src/bad.tsx", bad);
  fixture.write("apps/web/e2e/bad.tsx", bad);

  result = fixture.lint([SRC, "packages", "apps/web/e2e"]);

  const withBaseline = createFixture();
  withBaseline.write(`${DIR}/exact.tsx`, bad);
  withBaseline.write(
    `${DIR}/grown.tsx`,
    lines(
      "export function A(p: { a: 1; b: 2; c: 3 }) { return <div />; }",
      "export function B(p: { a: 1; b: 2; c: 3 }) { return <div />; }"
    )
  );
  withBaseline.write(`${DIR}/stale.tsx`, bad);
  withBaseline.write(`${DIR}/unlisted.tsx`, bad);
  withBaseline.write(
    BASELINE,
    `${JSON.stringify({
      [`${DIR}/exact.tsx`]: 1,
      [`${DIR}/grown.tsx`]: 1,
      [`${DIR}/stale.tsx`]: 2,
    })}\n`
  );
  baselined = withBaseline.lint([SRC]);
}, LINT_TIMEOUT_MS);

const hits = (file: string) => findingsFor(result, file, RULE);

describe("named props type (component-props-type)", () => {
  it.each(Object.entries(FAIL))("rejects %s", (name, expected) => {
    expect(hits(`${DIR}/${name}`).map((f) => f.line)).toEqual([expected.line]);
  });

  it("names the component, the count, the fix and the convention", () => {
    const [hit] = hits(`${DIR}/function-declaration.tsx`);
    expect(hit?.message).toContain("A types 3 props inline");
    expect(hit?.message).toContain("type AProps = { ... }");
    expect(hit?.message).toContain(
      "conventions: a named XProps type when a component has more than two props"
    );
  });

  it.each(Object.keys(OK))("allows %s", (name) => {
    expect(hits(`${DIR}/${name}`)).toHaveLength(0);
  });

  it("applies in shared/, routes/ and nested folders", () => {
    expect(hits(`${SRC}/shared/ui/deep/er/bad.tsx`)).toHaveLength(1);
    expect(hits(`${SRC}/routes/bad.tsx`)).toHaveLength(1);
  });

  it("only looks at .tsx files", () => {
    expect(hits(`${DIR}/not-tsx.ts`)).toHaveLength(0);
  });

  it("exempts tests", () => {
    expect(hits(`${DIR}/__tests__/bad.tsx`)).toHaveLength(0);
    expect(hits(`${DIR}/bad.test.tsx`)).toHaveLength(0);
    expect(hits(`${DIR}/bad.spec.tsx`)).toHaveLength(0);
  });

  it("ignores trees outside apps/web/src", () => {
    expect(hits("packages/ui/src/bad.tsx")).toHaveLength(0);
    expect(hits("apps/web/e2e/bad.tsx")).toHaveLength(0);
  });
});

describe("component-props-type baseline", () => {
  const baselinedHits = (file: string) =>
    findingsFor(baselined, `${DIR}/${file}`, RULE);

  it("passes a file whose violations equal its baseline count", () => {
    expect(baselinedHits("exact.tsx")).toHaveLength(0);
  });

  it("fails only the components beyond the baselined count", () => {
    const hit = baselinedHits("grown.tsx");
    expect(hit).toHaveLength(1);
    expect(hit[0]?.message).toContain("B types 3 props inline");
    expect(hit[0]?.message).toContain("allows 1");
  });

  it("fails a stale entry whose file no longer has that many", () => {
    const hit = baselinedHits("stale.tsx");
    expect(hit).toHaveLength(1);
    expect(hit[0]?.message).toContain("Stale baseline entry");
  });

  it("fails a file the baseline does not list", () => {
    const hit = baselinedHits("unlisted.tsx");
    expect(hit).toHaveLength(1);
    expect(hit[0]?.message).toContain("allows 0");
  });
});
