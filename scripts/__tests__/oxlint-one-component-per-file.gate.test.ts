/**
 * Proves the real `oxlint.config.ts` allows one exported component per `.tsx` file under
 * `apps/web/src` (`watchdog/one-component-per-file`). The fixture starts with no
 * baseline, so every surplus component reports. Probe files are written into a throwaway
 * repo that carries the real config and plugin (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/one-component-per-file";
const SRC = "apps/web/src";
const DIR = `${SRC}/domains/cases/components`;
const BASELINE = "scripts/oxlint-plugin/baselines/one-component-per-file.json";

const createFixture = oxlintFixtureFactory();

let result: LintResult;
let baselined: LintResult;

const lines = (...rows: string[]) => `${rows.join("\n")}\n`;

/** Source plus the 1-based lines the surplus components are reported on. */
interface Case {
  readonly source: string;
  readonly lines: readonly number[];
}

const FAIL: Record<string, Case> = {
  "function-declarations.tsx": {
    source: lines(
      "export function A() { return <div />; }",
      "export function B() { return <div />; }"
    ),
    lines: [2],
  },
  "arrow-bindings.tsx": {
    source: lines(
      "export const A = () => <div />;",
      "export const B = () => <div />;"
    ),
    lines: [2],
  },
  "function-expressions.tsx": {
    source: lines(
      "export const A = function () { return <div />; };",
      "export const B = function B() { return <div />; };"
    ),
    lines: [2],
  },
  "function-and-arrow.tsx": {
    source: lines(
      "export function A() { return <div />; }",
      "export const B = () => <div />;"
    ),
    lines: [2],
  },
  "async-function.tsx": {
    source: lines(
      "export function A() { return <div />; }",
      "export async function B() { return <div />; }"
    ),
    lines: [2],
  },
  "three-components.tsx": {
    source: lines(
      "export function A() { return <div />; }",
      "export function B() { return <div />; }",
      "export function C() { return <div />; }"
    ),
    lines: [2, 3],
  },
  "one-declaration-two-declarators.tsx": {
    source: lines("export const A = () => <div />, B = () => <div />;"),
    lines: [1],
  },
  "memo-and-forward-ref.tsx": {
    source: lines(
      'import { forwardRef, memo } from "react";',
      "export const A = memo(function A() { return <div />; });",
      "export const B = forwardRef<HTMLDivElement>(function B(_, ref) { return <div ref={ref} />; });"
    ),
    lines: [3],
  },
  "react-member-wrappers.tsx": {
    source: lines(
      'import React from "react";',
      "export const A = React.memo(() => <div />);",
      "export const B = React.forwardRef<HTMLDivElement>((_, ref) => <div ref={ref} />);"
    ),
    lines: [3],
  },
  "nested-wrappers.tsx": {
    source: lines(
      'import { memo, forwardRef } from "react";',
      "export const A = memo(forwardRef<HTMLDivElement>((_, ref) => <div ref={ref} />));",
      "export const B = memo(() => <div />);"
    ),
    lines: [3],
  },
  "specifier-list.tsx": {
    source: lines(
      "function A() { return <div />; }",
      "function B() { return <div />; }",
      "export { A, B };"
    ),
    lines: [3],
  },
  "specifier-list-arrows.tsx": {
    source: lines(
      "const A = () => <div />;",
      "const B = () => <div />;",
      "export { A, B };"
    ),
    lines: [3],
  },
  "specifier-aliases.tsx": {
    source: lines(
      "function A() { return <div />; }",
      "function B() { return <div />; }",
      "export { A as First, B as Second };"
    ),
    lines: [3],
  },
  "specifiers-in-two-statements.tsx": {
    source: lines(
      "function A() { return <div />; }",
      "function B() { return <div />; }",
      "export { A };",
      "export { B };"
    ),
    lines: [4],
  },
  "declared-and-listed.tsx": {
    source: lines(
      "export function A() { return <div />; }",
      "function B() { return <div />; }",
      "export { B };"
    ),
    lines: [3],
  },
  "default-function-and-named.tsx": {
    source: lines(
      "export function A() { return <div />; }",
      "export default function B() { return <div />; }"
    ),
    lines: [2],
  },
  "default-anonymous-function-and-named.tsx": {
    source: lines(
      "export function A() { return <div />; }",
      "export default function () { return <div />; }"
    ),
    lines: [2],
  },
  "default-anonymous-arrow-and-named.tsx": {
    source: lines(
      "export function A() { return <div />; }",
      "export default () => <div />;"
    ),
    lines: [2],
  },
  "default-memo-and-named.tsx": {
    source: lines(
      'import { memo } from "react";',
      "export function A() { return <div />; }",
      "export default memo(() => <div />);"
    ),
    lines: [3],
  },
  "default-identifier-and-named.tsx": {
    source: lines(
      "export function A() { return <div />; }",
      "const B = () => <div />;",
      "export default B;"
    ),
    lines: [3],
  },
  "class-components.tsx": {
    source: lines(
      'import { Component } from "react";',
      'import * as React from "react";',
      "export class A extends Component { render() { return <div />; } }",
      "export class B extends React.PureComponent { render() { return <div />; } }"
    ),
    lines: [4],
  },
  "default-class-and-named.tsx": {
    source: lines(
      'import { Component } from "react";',
      "export function A() { return <div />; }",
      "export default class B extends Component { render() { return <div />; } }"
    ),
    lines: [3],
  },
  "type-wrapped.tsx": {
    source: lines(
      'import type { FC } from "react";',
      "export const A = (() => <div />) as FC;",
      "export const B: FC = (() => <div />) satisfies FC;"
    ),
    lines: [3],
  },
  "alias-of-local-component.tsx": {
    source: lines(
      "const Inner = () => <div />;",
      "export const A = Inner;",
      "export function B() { return <div />; }"
    ),
    lines: [3],
  },
  "two-names-and-another.tsx": {
    source: lines(
      "export function A() { return <div />; }",
      "export { A as Alias };",
      "export function B() { return <div />; }"
    ),
    lines: [3],
  },
  "surplus-beside-private-helper-and-types.tsx": {
    source: lines(
      "type Props = { x: number };",
      "function Helper() { return <i />; }",
      "export function A(_: Props) { return <Helper />; }",
      "export function B() { return <Helper />; }"
    ),
    lines: [4],
  },
  "uses-imported-component.tsx": {
    source: lines(
      'import { Other } from "./other";',
      "export function A() { return <Other />; }",
      "export const B = () => <Other />;"
    ),
    lines: [3],
  },
};

const OK: Record<string, string> = {
  "single.tsx": lines("export function A() { return <div />; }"),
  "single-default.tsx": lines(
    "export default function A() { return <div />; }"
  ),
  "single-arrow.tsx": lines("export const A = () => <div />;"),
  "single-memo.tsx": lines(
    'import { memo } from "react";',
    "export const A = memo(() => <div />);"
  ),
  "no-component.tsx": lines("export const value = 1;"),
  "types-constants-hooks-helpers.tsx": lines(
    "export type Props = { x: number };",
    "export interface Shape { y: string }",
    "export enum Mode { On }",
    "export const FOO = () => 1;",
    "export const FOO_BAR = () => 1;",
    "export const LIMIT = 5;",
    "export const useThing = () => 1;",
    "export function useOther() { return 1; }",
    "export function helper() { return 1; }",
    "export const makeThing = () => <div />;",
    "export function A() { return <div />; }"
  ),
  "non-component-pascal-values.tsx": lines(
    'import { createContext } from "react";',
    "export const Ctx = createContext(1);",
    "export const Schema = { shape: 1 };",
    "export const Count = 5;",
    "export const Klass = class {};",
    "export class Store {}",
    "export function A() { return <div />; }"
  ),
  "private-helpers.tsx": lines(
    "function Helper() { return <i />; }",
    "const Other = () => <b />;",
    "export function A() { return <><Helper /><Other /></>; }"
  ),
  "overload-signatures.tsx": lines(
    "export function A(x: string): JSX.Element;",
    "export function A(x: number): JSX.Element;",
    "export function A(x: unknown) { return <div>{String(x)}</div>; }"
  ),
  "one-component-many-names.tsx": lines(
    "export function A() { return <div />; }",
    "export { A as Alias, A as Other };",
    "export default A;"
  ),
  "default-named-twice.tsx": lines(
    "const A = () => <div />;",
    "export { A };",
    "export default A;"
  ),
  "pure-reexports.tsx": lines(
    'export { A, B } from "./x";',
    'export { default as C } from "./y";',
    'export * from "./z";',
    'export * as ns from "./w";'
  ),
  "one-component-and-reexports.tsx": lines(
    'export { B, C } from "./x";',
    "export function A() { return <div />; }"
  ),
  "imported-then-exported.tsx": lines(
    'import { B } from "./b";',
    "export function A() { return <B />; }",
    "export { B };"
  ),
  "type-only-exports.tsx": lines(
    "function A() { return <div />; }",
    "function B() { return <div />; }",
    "export type { A };",
    "export { type B };",
    "export function C() { return <div />; }"
  ),
  "shadowed-name-is-not-the-export.tsx": lines(
    'import { B } from "./b";',
    "function helper() {",
    "  function B() { return <i />; }",
    "  return B;",
    "}",
    "export function A() { return <div>{helper().name}</div>; }",
    "export { B };"
  ),
  "list-with-non-components.tsx": lines(
    "const LIMIT = 5;",
    "const useThing = () => 1;",
    "function helper() { return 1; }",
    "function A() { return <div />; }",
    "export { LIMIT, useThing, helper, A };"
  ),
  "default-non-component-call.tsx": lines(
    "export function A() { return <div />; }",
    "export default defineThing(() => 1);"
  ),
  "default-hook-function.tsx": lines(
    "export function A() { return <div />; }",
    "export default function useThing() { return 1; }"
  ),
  "unresolved-and-cyclic-aliases.tsx": lines(
    "const X = Y;",
    "const Y = X;",
    "export { X };",
    "export const Missing = Nowhere;",
    "export function A() { return <div />; }"
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

  const two = FAIL["function-declarations.tsx"]?.source ?? "";
  fixture.write(`${DIR}/not-tsx.ts`, two.replaceAll("<div />", "1"));
  fixture.write(`${SRC}/shared/ui/deep/er/two.tsx`, two);
  fixture.write(`${SRC}/shared/layout/two.tsx`, two);
  fixture.write(`${SRC}/routes/two.tsx`, two);

  fixture.write(`${DIR}/index.tsx`, OK["pure-reexports.tsx"] ?? "");
  fixture.write(`${DIR}/__tests__/two.tsx`, two);
  fixture.write(`${DIR}/__tests__/two.component.test.tsx`, two);
  fixture.write(`${DIR}/two.test.tsx`, two);
  fixture.write(`${DIR}/two.spec.tsx`, two);
  fixture.write(`${SRC}/routes/_protected/ui/-gallery.tsx`, two);
  fixture.write(`${SRC}/routes/_protected/ui/sections/-more.tsx`, two);
  fixture.write(`${SRC}/shared/ui/primitives/wrapper.tsx`, two);
  fixture.write("packages/ui/src/two.tsx", two);
  fixture.write("apps/web/e2e/two.tsx", two);
  fixture.write("apps/web/two.tsx", two);

  result = fixture.lint([SRC, "packages", "apps/web/e2e", "apps/web/two.tsx"]);

  const withBaseline = createFixture();
  withBaseline.write(`${DIR}/exact.tsx`, two);
  withBaseline.write(
    `${DIR}/grown.tsx`,
    FAIL["three-components.tsx"]?.source ?? ""
  );
  withBaseline.write(`${DIR}/stale.tsx`, two);
  withBaseline.write(`${DIR}/unlisted.tsx`, two);
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

describe("one exported component per file (one-component-per-file)", () => {
  it.each(Object.entries(FAIL))("rejects %s", (name, expected) => {
    expect(hits(`${DIR}/${name}`).map((f) => f.line)).toEqual([
      ...expected.lines,
    ]);
  });

  it("names the surplus component, the first one, the fix and the convention", () => {
    const [hit] = hits(`${DIR}/function-declarations.tsx`);
    expect(hit?.message).toContain("B is a second exported component");
    expect(hit?.message).toContain("A is the first");
    expect(hit?.message).toContain("its own file");
    expect(hit?.message).toContain("index.ts barrel");
    expect(hit?.message).toContain(
      "conventions: one exported component per .tsx file"
    );
  });

  it("reports every component after the first, not one per file", () => {
    const names = hits(`${DIR}/three-components.tsx`).map(
      (f) => f.message.split(" ")[0]
    );
    expect(names).toEqual(["B", "C"]);
  });

  it.each(Object.keys(OK))("allows %s", (name) => {
    expect(hits(`${DIR}/${name}`)).toHaveLength(0);
  });

  it("applies in shared/, routes/ and nested folders", () => {
    expect(hits(`${SRC}/shared/ui/deep/er/two.tsx`)).toHaveLength(1);
    expect(hits(`${SRC}/shared/layout/two.tsx`)).toHaveLength(1);
    expect(hits(`${SRC}/routes/two.tsx`)).toHaveLength(1);
  });

  it("only looks at .tsx files", () => {
    expect(hits(`${DIR}/not-tsx.ts`)).toHaveLength(0);
  });

  it("lets a barrel re-export without counting", () => {
    expect(hits(`${DIR}/index.tsx`)).toHaveLength(0);
  });

  it("exempts tests", () => {
    expect(hits(`${DIR}/__tests__/two.tsx`)).toHaveLength(0);
    expect(hits(`${DIR}/__tests__/two.component.test.tsx`)).toHaveLength(0);
    expect(hits(`${DIR}/two.test.tsx`)).toHaveLength(0);
    expect(hits(`${DIR}/two.spec.tsx`)).toHaveLength(0);
  });

  it("exempts the registries: UI gallery routes and primitives wrappers", () => {
    expect(hits(`${SRC}/routes/_protected/ui/-gallery.tsx`)).toHaveLength(0);
    expect(hits(`${SRC}/routes/_protected/ui/sections/-more.tsx`)).toHaveLength(
      0
    );
    expect(hits(`${SRC}/shared/ui/primitives/wrapper.tsx`)).toHaveLength(0);
  });

  it("ignores trees outside apps/web/src", () => {
    expect(hits("packages/ui/src/two.tsx")).toHaveLength(0);
    expect(hits("apps/web/e2e/two.tsx")).toHaveLength(0);
    expect(hits("apps/web/two.tsx")).toHaveLength(0);
  });
});

describe("one-component-per-file baseline", () => {
  const baselinedHits = (file: string) =>
    findingsFor(baselined, `${DIR}/${file}`, RULE);

  it("passes a file whose surplus equals its baseline count", () => {
    expect(baselinedHits("exact.tsx")).toHaveLength(0);
  });

  it("fails only the components beyond the baselined count", () => {
    const hit = baselinedHits("grown.tsx");
    expect(hit).toHaveLength(1);
    expect(hit[0]?.message).toContain("C is a second exported component");
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
