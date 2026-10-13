/**
 * Proves the real `oxlint.config.ts` enforces handler naming for web components
 * (`watchdog/handler-naming`): props are `onX`, implementations are `handleX`, and no
 * `handleX` name appears in a props type or on a JSX attribute. Probe files are written
 * into a throwaway repo that carries the real config and plugin (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/handler-naming";
const SRC = "apps/web/src";
const DIR = `${SRC}/domains/cases/components`;
const BASELINE = "scripts/oxlint-plugin/baselines/handler-naming.json";

const createFixture = oxlintFixtureFactory();

let result: LintResult;
let baselined: LintResult;

const lines = (...rows: string[]) => `${rows.join("\n")}\n`;

/** Source plus the 1-based lines the findings are reported on. */
type Case = { readonly source: string; readonly lines: readonly number[] };

const FAIL: Record<string, Case> = {
  "inline-props-type.tsx": {
    source: lines(
      "export function A({ handleSave }: { handleSave: () => void }) {",
      "  return <button onClick={handleSave} />;",
      "}"
    ),
    lines: [1],
  },
  "named-props-type.tsx": {
    source: lines(
      "type AProps = {",
      "  label: string;",
      "  handleSave: () => void;",
      "};",
      "export function A(p: AProps) { return <i>{p.label}</i>; }"
    ),
    lines: [3],
  },
  "method-signature.tsx": {
    source: lines(
      "type AProps = { handleSave(): void };",
      "export const A = (p: AProps) => <i />;"
    ),
    lines: [1],
  },
  "interface-props.tsx": {
    source: lines(
      "interface AProps { handleSave: () => void }",
      "export const A = (p: AProps) => <i />;"
    ),
    lines: [1],
  },
  "intersection-props.tsx": {
    source: lines(
      "type Base = { a: 1 };",
      "type AProps = Base & { handleSave: () => void };",
      "export const A = (p: AProps) => <i />;"
    ),
    lines: [2],
  },
  "memo-props.tsx": {
    source: lines(
      'import { memo } from "react";',
      "type AProps = { handleSave: () => void };",
      "export const A = memo((p: AProps) => <i />);"
    ),
    lines: [2],
  },
  "jsx-attribute.tsx": {
    source: lines(
      'import { B } from "./b";',
      "export function A() {",
      "  return <B handleSave={() => {}} />;",
      "}"
    ),
    lines: [3],
  },
  "jsx-member-component.tsx": {
    source: lines(
      'import * as Ui from "./ui";',
      "export function A() {",
      "  return <Ui.B handleSave={() => {}} />;",
      "}"
    ),
    lines: [3],
  },
  "local-function-to-on-prop.tsx": {
    source: lines(
      'import { B } from "./b";',
      "export function A() {",
      "  const save = () => {};",
      "  return <B onSave={save} />;",
      "}"
    ),
    lines: [4],
  },
  "local-function-declaration-to-on-prop.tsx": {
    source: lines(
      "export function A() {",
      "  function save() {}",
      "  return <button onClick={save} />;",
      "}"
    ),
    lines: [3],
  },
  "local-use-callback-to-on-prop.tsx": {
    source: lines(
      'import { useCallback } from "react";',
      'import { B } from "./b";',
      "export function A() {",
      "  const save = useCallback(() => {}, []);",
      "  return <B onSave={save} />;",
      "}"
    ),
    lines: [5],
  },
};

const OK: Record<string, string> = {
  "on-props.tsx": lines(
    "type AProps = { onSave: () => void; onClose: () => void; label: string };",
    "export function A({ onSave, onClose, label }: AProps) {",
    "  return <button onClick={onSave} onBlur={onClose}>{label}</button>;",
    "}"
  ),
  "handle-implementation.tsx": lines(
    'import { B } from "./b";',
    "export function A({ onSave }: { onSave: () => void }) {",
    "  const handleSave = () => onSave();",
    "  function handleClose() {}",
    "  return <B onSave={handleSave} onClose={handleClose} />;",
    "}"
  ),
  "inline-arrow.tsx": lines(
    'import { B } from "./b";',
    "export function A() { return <B onSave={() => {}} />; }"
  ),
  "member-and-props-passthrough.tsx": lines(
    'import { B } from "./b";',
    "export function A(props: { onSave: () => void }) {",
    "  const form = { handleChange: () => {} };",
    "  return <B onSave={props.onSave} onChange={form.handleChange} />;",
    "}"
  ),
  "hook-and-setter-values.tsx": lines(
    'import { useState } from "react";',
    'import { useThing } from "./use-thing";',
    'import { B } from "./b";',
    "export function A() {",
    "  const [, setOpen] = useState(false);",
    "  const { retry } = useThing();",
    "  const again = useThing();",
    "  return <B onOpenChange={setOpen} onRetry={retry} onAgain={again} />;",
    "}"
  ),
  "module-level-and-imported-functions.tsx": lines(
    'import { B } from "./b";',
    'import { pick } from "./pick";',
    "const noop = () => {};",
    "function top() {}",
    "export function A() {",
    "  return <B onA={noop} onB={top} onC={pick} />;",
    "}"
  ),
  "non-on-attribute-gets-local-function.tsx": lines(
    'import { B } from "./b";',
    "export function A() {",
    "  const render = () => <i />;",
    "  return <B renderRow={render} />;",
    "}"
  ),
  "handle-attribute-on-dom-element.tsx": lines(
    'export function A() { return <input handleSave="x" />; }'
  ),
  "handle-in-non-props-type.tsx": lines(
    "type FieldApi = { handleBlur: () => void; handleChange: (v: string) => void };",
    "export function A({ onField }: { onField: (f: FieldApi) => void }) {",
    "  return <i />;",
    "}"
  ),
  "handle-nested-in-props-member.tsx": lines(
    "type AProps = { form: { handleSubmit: () => void }; onSave: () => void };",
    "export function A(p: AProps) { return <i />; }"
  ),
  "handle-name-on-non-component.tsx": lines(
    "type HookResult = { handleSave: () => void };",
    "export const useThing = (p: HookResult) => p;",
    "export function helper(p: { handleSave: () => void }) { return p; }"
  ),
  "handle-attribute-name-without-capital.tsx": lines(
    'import { B } from "./b";',
    'export function A() { return <B handle="x" handled={1} handler={2} />; }'
  ),
  "unresolvable-props-type.tsx": lines(
    'import type { Shared } from "./shared";',
    "export function A(p: Shared) { return <div />; }"
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

  const bad = FAIL["inline-props-type.tsx"]?.source ?? "";
  fixture.write(`${SRC}/shared/ui/deep/er/bad.tsx`, bad);
  fixture.write(`${SRC}/routes/bad.tsx`, bad);
  fixture.write(`${DIR}/__tests__/bad.tsx`, bad);
  fixture.write(`${DIR}/bad.test.tsx`, bad);
  fixture.write(`${DIR}/bad.spec.tsx`, bad);
  fixture.write(`${SRC}/auth/ui/bad.tsx`, bad);
  fixture.write("packages/ui/src/bad.tsx", bad);
  fixture.write("apps/web/e2e/bad.tsx", bad);

  result = fixture.lint([SRC, "packages", "apps/web/e2e"]);

  const withBaseline = createFixture();
  withBaseline.write(`${DIR}/exact.tsx`, bad);
  withBaseline.write(
    `${DIR}/grown.tsx`,
    lines(
      "export function A(p: { handleSave: () => void }) { return <div />; }",
      "export function B(p: { handleSave: () => void }) { return <div />; }"
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

describe("handler naming (handler-naming)", () => {
  it.each(Object.entries(FAIL))("rejects %s", (name, expected) => {
    expect(hits(`${DIR}/${name}`).map((f) => f.line)).toEqual([
      ...expected.lines,
    ]);
  });

  it("tells a props-type finding to rename the prop to onX", () => {
    const [hit] = hits(`${DIR}/named-props-type.tsx`);
    expect(hit?.message).toContain("`handleSave`");
    expect(hit?.message).toContain("`onSave`");
    expect(hit?.message).toContain("props are `onX`");
  });

  it("tells a JSX attribute finding to pass it as onX", () => {
    const [hit] = hits(`${DIR}/jsx-attribute.tsx`);
    expect(hit?.message).toContain("`handleSave`");
    expect(hit?.message).toContain("`onSave`");
  });

  it("tells a local-function finding to name it handleX", () => {
    const [hit] = hits(`${DIR}/local-function-to-on-prop.tsx`);
    expect(hit?.message).toContain("`save`");
    expect(hit?.message).toContain("`handleSave`");
    expect(hit?.message).toContain("`onSave`");
  });

  it.each(Object.keys(OK))("allows %s", (name) => {
    expect(hits(`${DIR}/${name}`)).toHaveLength(0);
  });

  it("applies in shared/, routes/ and nested folders", () => {
    expect(hits(`${SRC}/shared/ui/deep/er/bad.tsx`)).toHaveLength(1);
    expect(hits(`${SRC}/routes/bad.tsx`)).toHaveLength(1);
  });

  it("exempts tests and the auth/ui tree", () => {
    expect(hits(`${DIR}/__tests__/bad.tsx`)).toHaveLength(0);
    expect(hits(`${DIR}/bad.test.tsx`)).toHaveLength(0);
    expect(hits(`${DIR}/bad.spec.tsx`)).toHaveLength(0);
    expect(hits(`${SRC}/auth/ui/bad.tsx`)).toHaveLength(0);
  });

  it("ignores trees outside apps/web/src", () => {
    expect(hits("packages/ui/src/bad.tsx")).toHaveLength(0);
    expect(hits("apps/web/e2e/bad.tsx")).toHaveLength(0);
  });
});

describe("handler-naming baseline", () => {
  const baselinedHits = (file: string) =>
    findingsFor(baselined, `${DIR}/${file}`, RULE);

  it("passes a file whose violations equal its baseline count", () => {
    expect(baselinedHits("exact.tsx")).toHaveLength(0);
  });

  it("fails only the findings beyond the baselined count", () => {
    const hit = baselinedHits("grown.tsx");
    expect(hit).toHaveLength(1);
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
