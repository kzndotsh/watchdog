/**
 * Proves the real `oxlint.config.ts` bans importing types from `*.functions` server-function
 * modules in `apps/web/src` (`watchdog/no-types-from-functions`): `import type`, inline
 * `type` specifiers, bindings only used as types, namespaces, type re-exports and
 * `import()` types. A domain's own `*.functions.ts` and queries modules are exempt. Probe
 * files are written into a throwaway repo that carries the real config and plugin
 * (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/no-types-from-functions";
const SRC = "apps/web/src";
const DIR = `${SRC}/domains/dossier/components`;
const FNS = "@/domains/entities/edges/edges.functions";

const createFixture = oxlintFixtureFactory();

let result: LintResult;

/** File name to source and the number of reports it must produce. */
const FAIL: Record<string, readonly [string, number]> = {
  "import-type.ts": [
    `import type { A } from "${FNS}";\nexport type X = A;\n`,
    1,
  ],
  "import-type-relative.ts": [
    'import type { A } from "./edges.functions";\nexport type X = A;\n',
    1,
  ],
  "import-type-ext.ts": [
    'import type { A } from "./edges.functions.ts";\nexport type X = A;\n',
    1,
  ],
  "import-type-default.ts": [
    `import type A from "${FNS}";\nexport type X = A;\n`,
    1,
  ],
  "import-type-two.ts": [
    `import type { A, B } from "${FNS}";\nexport type X = A | B;\n`,
    2,
  ],
  "inline-type.ts": [
    `import { fn, type A } from "${FNS}";\nexport const x = fn();\nexport type X = A;\n`,
    1,
  ],
  "inline-type-aliased.ts": [
    `import { type A as Alias } from "${FNS}";\nexport type X = Alias;\n`,
    1,
  ],
  "multiline-inline-type.ts": [
    `import {\n  createFn,\n  type A,\n} from "${FNS}";\nexport const x = createFn();\nexport type X = A;\n`,
    1,
  ],
  "value-import-type-use.ts": [
    `import { A } from "${FNS}";\nexport const x: A = null as never;\n`,
    1,
  ],
  "value-import-generic-use.ts": [
    `import { A } from "${FNS}";\nexport type X = Array<A>;\n`,
    1,
  ],
  "value-import-aliased.ts": [
    `import { A as Alias } from "${FNS}";\nexport function f(a: Alias): Alias[] { return [a]; }\n`,
    1,
  ],
  "value-import-implements.ts": [
    `import { A } from "${FNS}";\nexport class C implements A {}\n`,
    1,
  ],
  "value-import-interface-extends.ts": [
    `import { A } from "${FNS}";\nexport interface I extends A {}\n`,
    1,
  ],
  "value-import-export-type.ts": [
    `import { A } from "${FNS}";\nexport type { A };\n`,
    1,
  ],
  "namespace-type-only.ts": [
    `import * as F from "${FNS}";\nexport type X = F.A;\n`,
    1,
  ],
  "reexport-type.ts": [`export type { A } from "${FNS}";\n`, 1],
  "reexport-inline-type.ts": [`export { type A } from "${FNS}";\n`, 1],
  "reexport-type-all.ts": [`export type * from "${FNS}";\n`, 1],
  "reexport-value.ts": [`export { fn } from "${FNS}";\n`, 1],
  "reexport-all.ts": [`export * from "${FNS}";\n`, 1],
  "reexport-aliased.ts": [`export { fn as other } from "${FNS}";\n`, 1],
  "local-value-shadow.ts": [
    `import { A } from "${FNS}";\nexport function f(a: A) {\n  const run = () => {\n    const A = 1;\n    return A;\n  };\n  return [a, run];\n}\n`,
    1,
  ],
  "local-value-same-name.ts": [
    `import type { A } from "${FNS}";\nexport const x: A = null as never;\nexport const other = () => {\n  const A = 1;\n  return A;\n};\n`,
    1,
  ],
  "signature-key-same-name.ts": [
    `import { A } from "${FNS}";\nexport interface I {\n  A: string;\n  load(): A;\n}\nexport interface J {\n  A(): void;\n}\n`,
    1,
  ],
  "import-type-expression.ts": [`export type X = import("${FNS}").A;\n`, 1],
};

const OK: Record<string, string> = {
  "value-use.ts": `import { fn } from "${FNS}";\nexport const x = fn();\n`,
  "typeof-use.ts": `import { fn } from "${FNS}";\nexport type R = Awaited<ReturnType<typeof fn>>;\n`,
  "typeof-import.ts": `export type R = typeof import("${FNS}");\n`,
  "value-and-type-use.ts": `import { A } from "${FNS}";\nexport const a = A;\nexport type X = A;\n`,
  "namespace-value-use.ts": `import * as F from "${FNS}";\nexport const x = F.fn();\nexport type X = F.A;\n`,
  "jsx-use.tsx": `import { Comp } from "${FNS}";\nexport const x = <Comp />;\n`,
  "export-value.ts": `import { fn } from "${FNS}";\nexport { fn };\n`,
  "side-effect.ts": `import "${FNS}";\n`,
  "types-module.ts": `import type { A } from "@/domains/entities/edges/types";\nexport type X = A;\n`,
  "schemas.ts": `import type { A } from "@watchdog/schemas/graph";\nexport type X = A;\n`,
  "server-module.ts": `import type { A } from "./edges.functions.server";\nexport type X = A;\n`,
  "lookalike.ts": `import type { A } from "./functions";\nimport type { B } from "./my-functions-helpers";\nexport type X = A | B;\n`,
  "unused.ts": `import { A } from "${FNS}";\n`,
};

beforeAll(() => {
  const fixture = createFixture();

  for (const [name, [source]] of Object.entries(FAIL)) {
    fixture.write(`${DIR}/${name}`, source);
  }
  for (const [name, source] of Object.entries(OK)) {
    fixture.write(`${DIR}/${name}`, source);
  }
  const typeImport = `import type { A } from "${FNS}";\nexport type X = A;\n`;
  fixture.write(`${SRC}/domains/entities/edges/edges.functions.ts`, typeImport);
  fixture.write(`${SRC}/domains/entities/edges/queries.ts`, typeImport);
  fixture.write(`${SRC}/domains/jobs/artifact-queries.ts`, typeImport);
  fixture.write(`${SRC}/domains/dossier/lib/queries-helper.ts`, typeImport);
  fixture.write(`${SRC}/domains/dossier/lib/queries.test.ts`, typeImport);
  fixture.write(`${SRC}/routes/route.tsx`, typeImport);
  fixture.write(`${SRC}/shared/queries.ts`, typeImport);
  fixture.write(`${SRC}/shared/lib/helper.functions.ts`, typeImport);
  fixture.write(`${SRC}/shared/ui/primitive.tsx`, typeImport);
  fixture.write(`${SRC}/domains/dossier/hooks/use-x.ts`, typeImport);
  fixture.write(
    `${SRC}/domains/dossier/components/__tests__/x.test.ts`,
    typeImport
  );
  fixture.write("packages/core/src/x.ts", typeImport);

  result = fixture.lint([SRC, "packages"]);
}, LINT_TIMEOUT_MS);

const hits = (file: string) => findingsFor(result, file, RULE);

describe("no types from *.functions modules (no-types-from-functions)", () => {
  it.each(Object.entries(FAIL))("rejects %s", (name, [, count]) => {
    expect(hits(`${DIR}/${name}`)).toHaveLength(count);
  });

  it("names the type, the fix and the convention, on the right line", () => {
    const [hit] = hits(`${DIR}/import-type.ts`);
    expect(hit?.message).toContain("A is a type");
    expect(hit?.message).toContain("@watchdog/schemas");
    expect(hit?.message).toContain("types.ts");
    expect(hit?.message).toContain(
      "conventions: types are imported from schemas or types.ts, never from *.functions"
    );
    expect(hit?.line).toBe(1);
  });

  it("reports only the type specifier of a mixed import", () => {
    const [hit] = hits(`${DIR}/inline-type.ts`);
    expect(hit?.message).toContain("A is a type");
    expect(hit?.line).toBe(1);
  });

  it.each(Object.keys(OK))("allows %s", (name) => {
    expect(hits(`${DIR}/${name}`)).toHaveLength(0);
  });

  it("exempts a domain's own *.functions.ts and queries modules", () => {
    expect(
      hits(`${SRC}/domains/entities/edges/edges.functions.ts`)
    ).toHaveLength(0);
    expect(hits(`${SRC}/domains/entities/edges/queries.ts`)).toHaveLength(0);
    expect(hits(`${SRC}/domains/jobs/artifact-queries.ts`)).toHaveLength(0);
  });

  it("applies to hooks, routes, shared/ui, lib files, tests-like names and every other web file", () => {
    expect(hits(`${SRC}/domains/dossier/hooks/use-x.ts`)).toHaveLength(1);
    expect(hits(`${SRC}/routes/route.tsx`)).toHaveLength(1);
    expect(hits(`${SRC}/shared/queries.ts`)).toHaveLength(1);
    expect(hits(`${SRC}/shared/lib/helper.functions.ts`)).toHaveLength(1);
    expect(hits(`${SRC}/shared/ui/primitive.tsx`)).toHaveLength(1);
    expect(hits(`${SRC}/domains/dossier/lib/queries-helper.ts`)).toHaveLength(
      1
    );
  });

  it("applies to tests too and to nothing outside apps/web", () => {
    expect(hits(`${SRC}/domains/dossier/lib/queries.test.ts`)).toHaveLength(1);
    expect(
      hits(`${SRC}/domains/dossier/components/__tests__/x.test.ts`)
    ).toHaveLength(1);
    expect(hits("packages/core/src/x.ts")).toHaveLength(0);
  });
});
