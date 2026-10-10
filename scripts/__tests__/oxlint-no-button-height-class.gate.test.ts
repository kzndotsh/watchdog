/**
 * Proves the real `oxlint.config.ts` bans height utilities on the Button wrapper
 * (`watchdog/no-button-height-class`). The fixture starts with no baseline, so every
 * override reports. Probe files are written into a throwaway repo that carries the real
 * config and plugin (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/no-button-height-class";
const SRC = "apps/web/src";
const DIR = `${SRC}/domains/cases/components`;
const WRAPPER = "@/shared/ui/primitives/button";
const IMPORT = `import { Button } from "${WRAPPER}";\n`;
const CN = 'import { cn } from "@/lib/utils";\n';

const createFixture = oxlintFixtureFactory();

let result: LintResult;

/** Each source renders one Button whose className reaches for a height. */
const FAIL = {
  "literal.tsx": `${IMPORT}export const X = () => <Button className="h-8">a</Button>;\n`,
  "min-h.tsx": `${IMPORT}export const X = () => <Button className="min-h-0 p-0">a</Button>;\n`,
  "max-h.tsx": `${IMPORT}export const X = () => <Button className="max-h-9">a</Button>;\n`,
  "h-auto.tsx": `${IMPORT}export const X = () => <Button className="h-auto">a</Button>;\n`,
  "size-n.tsx": `${IMPORT}export const X = () => <Button className="size-6 p-0">a</Button>;\n`,
  "arbitrary.tsx": `${IMPORT}export const X = () => <Button className="h-[2.25rem]">a</Button>;\n`,
  "responsive.tsx": `${IMPORT}export const X = () => <Button className="sm:h-9">a</Button>;\n`,
  "important.tsx": `${IMPORT}export const X = () => <Button className="!h-9">a</Button>;\n`,
  "data-variant.tsx": `${IMPORT}export const X = () => <Button className="data-[size=sm]:h-7">a</Button>;\n`,
  "expression-string.tsx": `${IMPORT}export const X = () => <Button className={"h-8"}>a</Button>;\n`,
  "cn-arg.tsx": `${IMPORT}${CN}export const X = ({ on }: { on: boolean }) => <Button className={cn("px-2", on && "h-7")}>a</Button>;\n`,
  "cn-ternary.tsx": `${IMPORT}${CN}export const X = ({ on }: { on: boolean }) => <Button className={cn(on ? "h-7" : "px-2")}>a</Button>;\n`,
  "cn-array.tsx": `${IMPORT}${CN}export const X = () => <Button className={cn(["px-2", "h-7"])}>a</Button>;\n`,
  "cn-object.tsx": `${IMPORT}${CN}export const X = ({ on }: { on: boolean }) => <Button className={cn({ "h-7": on })}>a</Button>;\n`,
  "template.tsx": `${IMPORT}export const X = () => <Button className={\`px-2 h-8\`}>a</Button>;\n`,
  "template-expr.tsx": `${IMPORT}export const X = ({ c }: { c: string }) => <Button className={\`\${c} h-8\`}>a</Button>;\n`,
  "concat.tsx": `${IMPORT}export const X = () => <Button className={"px-2 " + "h-8"}>a</Button>;\n`,
  "const-ref.tsx": `${IMPORT}const CLS = "h-8 px-2";\nexport const X = () => <Button className={CLS}>a</Button>;\n`,
  "const-cn-ref.tsx": `${IMPORT}${CN}const CLS = cn("px-2", "h-8");\nexport const X = () => <Button className={CLS}>a</Button>;\n`,
  "aliased.tsx": `import { Button as Btn } from "${WRAPPER}";\nexport const X = () => <Btn className="h-8">a</Btn>;\n`,
  "namespace.tsx": `import * as B from "${WRAPPER}";\nexport const X = () => <B.Button className="h-8">a</B.Button>;\n`,
  "vanilla.tsx": `import { Button } from "@watchdog/ui/components/button";\nexport const X = () => <Button className="h-8">a</Button>;\n`,
  "spread-object.tsx": `${IMPORT}export const X = () => <Button {...{ className: "h-8" }}>a</Button>;\n`,
  "render-prop.tsx": `${IMPORT}export const X = () => <Trigger render={<Button className="h-7" />} />;\nfunction Trigger(_p: { render: unknown }) { return null; }\n`,
  "multiline.tsx": `${IMPORT}export const X = () => (\n  <Button\n    variant="ghost"\n    className="text-xs\n      h-6"\n  >\n    a\n  </Button>\n);\n`,
  "as-cast.tsx": `${IMPORT}export const X = () => <Button className={"h-8" as string}>a</Button>;\n`,
  "many.tsx": `${IMPORT}export const X = () => <Button className="h-8 min-h-0 size-6">a</Button>;\n`,
} as const;

const OK = {
  "no-class.tsx": `${IMPORT}export const X = () => <Button size="lg">a</Button>;\n`,
  "other-classes.tsx": `${IMPORT}export const X = () => <Button className="w-full px-2 text-xs justify-start">a</Button>;\n`,
  "width-only.tsx": `${IMPORT}export const X = () => <Button className="w-7 min-w-0 max-w-xs">a</Button>;\n`,
  "child-selector.tsx": `${IMPORT}export const X = () => <Button className="[&_svg]:size-4 [&>svg]:h-3 *:size-4">a</Button>;\n`,
  "look-alikes.tsx": `${IMPORT}export const X = () => <Button className="has-data-[icon]:pl-1 hover:bg-muted leading-none shrink-0">a</Button>;\n`,
  "spread-props.tsx": `${IMPORT}export const X = (props: object) => <Button {...props}>a</Button>;\n`,
  "other-component.tsx": `import { Button } from "./local-button";\nexport const X = () => <Button className="h-8">a</Button>;\n`,
  "div.tsx": `${IMPORT}export const X = () => <div className="h-8"><Button size="lg">a</Button></div>;\n`,
  "unused-const.tsx": `${IMPORT}const CLS = "h-8";\nexport const X = () => <Button>{CLS}</Button>;\n`,
  "other-attr.tsx": `${IMPORT}export const X = () => <Button title="h-8" aria-label="h-8">a</Button>;\n`,
} as const;

beforeAll(() => {
  const fixture = createFixture();
  for (const [name, source] of Object.entries(FAIL)) {
    fixture.write(`${DIR}/${name}`, source);
  }
  for (const [name, source] of Object.entries(OK)) {
    fixture.write(`${DIR}/${name}`, source);
  }
  fixture.write(`${SRC}/shared/ui/probe.tsx`, FAIL["literal.tsx"]);
  fixture.write(`${SRC}/routes/_protected/ui/-probe.tsx`, FAIL["literal.tsx"]);
  fixture.write(`${SRC}/shared/ui/primitives/own.tsx`, FAIL["literal.tsx"]);
  fixture.write(`${DIR}/__tests__/probe.test.tsx`, FAIL["literal.tsx"]);
  fixture.write(`${DIR}/probe.test.tsx`, FAIL["literal.tsx"]);
  fixture.write("packages/ui/src/probe.tsx", FAIL["literal.tsx"]);

  result = fixture.lint([SRC, "packages"]);
}, LINT_TIMEOUT_MS);

const hits = (file: string) => findingsFor(result, file, RULE);

describe("no height utilities on Button (no-button-height-class)", () => {
  it.each(Object.keys(FAIL))("rejects %s", (name) => {
    expect(hits(`${DIR}/${name}`)).toHaveLength(1);
  });

  it("names every offending class, the fix and the convention, on the right line", () => {
    const [hit] = hits(`${DIR}/many.tsx`);
    expect(hit?.message).toContain("h-8");
    expect(hit?.message).toContain("min-h-0");
    expect(hit?.message).toContain("size-6");
    expect(hit?.message).toContain("size=");
    expect(hit?.message).toContain(
      "conventions: no height utilities on Button"
    );
    expect(hit?.line).toBe(2);
  });

  it.each(Object.keys(OK))("allows %s", (name) => {
    expect(hits(`${DIR}/${name}`)).toHaveLength(0);
  });

  it("applies in shared/ui and routes", () => {
    expect(hits(`${SRC}/shared/ui/probe.tsx`)).toHaveLength(1);
    expect(hits(`${SRC}/routes/_protected/ui/-probe.tsx`)).toHaveLength(1);
  });

  it("exempts the wrapper itself, tests and trees outside apps/web/src", () => {
    expect(hits(`${SRC}/shared/ui/primitives/own.tsx`)).toHaveLength(0);
    expect(hits(`${DIR}/__tests__/probe.test.tsx`)).toHaveLength(0);
    expect(hits(`${DIR}/probe.test.tsx`)).toHaveLength(0);
    expect(hits("packages/ui/src/probe.tsx")).toHaveLength(0);
  });
});
