/**
 * Proves the real `oxlint.config.ts` bans `apps/web/src/shared` importing from
 * `apps/web/src/domains`, `app` or `routes` (`watchdog/shared-no-upward-imports`, #621): alias
 * and relative specifiers, every import form, type imports included, tests too. Probe files are written into a
 * throwaway repo that carries the real config and plugin (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/shared-no-upward-imports";
const SRC = "apps/web/src";
const UI = `${SRC}/shared/ui`;

const createFixture = oxlintFixtureFactory();

let result: LintResult;

/** One violating import per file, each a different spelling. */
const FAIL = {
  "alias.ts": 'import { a } from "@/domains/entities/lib/a";\nexport { a };\n',
  "alias-dotdot.ts":
    'import { a } from "@/shared/ui/../../domains/entities/types";\nexport { a };\n',
  "alias-type.ts":
    'import type { A } from "@/domains/entities/types";\nexport type X = A;\n',
  "alias-inline-type.ts":
    'import { type A } from "@/domains/entities/types";\nexport type X = A;\n',
  "alias-side-effect.ts": 'import "@/domains/entities/register";\n',
  "alias-bare-domains.ts": 'import { a } from "@/domains";\nexport { a };\n',
  "relative.ts":
    'import { a } from "../../domains/entities/lib/a";\nexport { a };\n',
  "relative-dot.ts":
    'import { a } from "./../../domains/entities/a";\nexport { a };\n',
  "reexport-named.ts": 'export { a } from "@/domains/entities/lib/a";\n',
  "reexport-all.ts": 'export * from "@/domains/entities/lib/a";\n',
  "reexport-type.ts": 'export type { A } from "@/domains/entities/types";\n',
  "dynamic.ts":
    'export const load = () => import("@/domains/entities/lib/a");\n',
  "dynamic-template.ts":
    "export const load = () => import(`@/domains/entities/lib/a`);\n",
  "require.ts":
    'declare const require: (id: string) => unknown;\nexport const a = require("@/domains/entities/lib/a");\n',
  "import-type.ts":
    'export type A = import("@/domains/entities/types").EntityRecord;\n',
  "nested/deep.ts":
    'import { a } from "../../../domains/entities/lib/a";\nexport { a };\n',
  "nested/alias.ts":
    'import { a } from "@/domains/entities/lib/a";\nexport { a };\n',
  "primitives/wrapper.ts":
    'import { a } from "@/domains/entities/lib/a";\nexport { a };\n',
  "app-alias.ts":
    'import { a } from "@/app/lib/query-invalidation";\nexport { a };\n',
  "app-relative.ts":
    'import { a } from "../../app/lib/query-invalidation";\nexport { a };\n',
  "app-dynamic.ts":
    'export const load = () => import("@/app/layout/app-shell");\n',
  "routes-alias.ts": 'import { a } from "@/routes/a";\nexport { a };\n',
  "routes-relative.ts":
    'import { a } from "../../routes/_protected";\nexport { a };\n',
  "routes-require.ts":
    'declare const require: (id: string) => unknown;\nexport const a = require("../../routes/_protected");\n',
} as const;

const OK = {
  "shared-lib.ts": 'import { a } from "@/shared/lib/a";\nexport { a };\n',
  "sibling.ts": 'import { a } from "./sibling-helper";\nexport { a };\n',
  "relative-up.ts": 'import { a } from "../lib/a";\nexport { a };\n',
  "package.ts":
    'import { a } from "@watchdog/schemas/shared";\nexport { a };\n',
  "lookalike-alias.ts": 'import { a } from "@/domains-kit/a";\nexport { a };\n',
  "lookalike-relative.ts": 'import { a } from "./domains/a";\nexport { a };\n',
  "lookalike-package.ts":
    'import { a } from "domains/entities";\nexport { a };\n',
  "comment.ts":
    '// import { a } from "@/domains/entities/lib/a";\nexport const a = "import(\\"@/domains/x\\")";\n',
  "dynamic-variable.ts": "export const load = (p: string) => import(p);\n",
  "lookalike-app.ts": 'import { a } from "@/apps/a";\nexport { a };\n',
} as const;

beforeAll(() => {
  const fixture = createFixture();

  for (const [name, source] of Object.entries(FAIL)) {
    fixture.write(`${UI}/${name}`, source);
  }
  for (const [name, source] of Object.entries(OK)) {
    fixture.write(`${UI}/${name}`, source);
  }
  fixture.write(
    `${UI}/__tests__/composes-domain.component.test.tsx`,
    'import { a } from "@/domains/entities/lib/a";\nexport { a };\n'
  );
  fixture.write(
    `${SRC}/shared/lib/not-ui.ts`,
    'import { a } from "@/domains/entities/lib/a";\nexport { a };\n'
  );
  fixture.write(
    `${SRC}/domains/cases/lib/domain-to-domain.ts`,
    'import { a } from "@/domains/entities/lib/a";\nexport { a };\n'
  );
  fixture.write(
    `${SRC}/app/lib/composes-domains.ts`,
    'import { a } from "@/domains/entities/lib/a";\nexport { a };\n'
  );
  fixture.write(
    `${SRC}/routes/route.ts`,
    'import { a } from "@/domains/entities/lib/a";\nexport { a };\n'
  );
  fixture.write(
    "packages/core/src/shared/ui/outside-web.ts",
    'import { a } from "@/domains/entities/lib/a";\nexport { a };\n'
  );

  result = fixture.lint([SRC, "packages"]);
}, LINT_TIMEOUT_MS);

const hits = (file: string) => findingsFor(result, file, RULE);

describe("shared imports no domain, app or route (shared-no-upward-imports)", () => {
  it.each(Object.keys(FAIL))("rejects %s", (name) => {
    expect(hits(`${UI}/${name}`)).toHaveLength(1);
  });

  it("states the fix, names the convention and points at the import", () => {
    const [hit] = hits(`${UI}/alias.ts`);
    expect(hit?.message).toContain("@/domains/entities/lib/a");
    expect(hit?.message).toContain("move");
    expect(hit?.message).toContain(
      "conventions: shared imports no domain, app or route"
    );
    expect(hit?.line).toBe(1);
  });

  it.each(Object.keys(OK))("allows %s", (name) => {
    expect(hits(`${UI}/${name}`)).toHaveLength(0);
  });

  it("covers tests and every shared folder, not only shared/ui", () => {
    expect(
      hits(`${UI}/__tests__/composes-domain.component.test.tsx`)
    ).toHaveLength(1);
    expect(hits(`${SRC}/shared/lib/not-ui.ts`)).toHaveLength(1);
  });

  it("leaves the app composition root, domains, routes and other packages to their own rules", () => {
    expect(hits(`${SRC}/app/lib/composes-domains.ts`)).toHaveLength(0);
    expect(hits(`${SRC}/domains/cases/lib/domain-to-domain.ts`)).toHaveLength(
      0
    );
    expect(hits(`${SRC}/routes/route.ts`)).toHaveLength(0);
    expect(hits("packages/core/src/shared/ui/outside-web.ts")).toHaveLength(0);
  });
});
