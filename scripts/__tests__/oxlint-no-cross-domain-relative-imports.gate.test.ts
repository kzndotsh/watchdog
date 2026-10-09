/**
 * Proves the real `oxlint.config.ts` requires the `@/` alias for imports that leave a
 * domain folder in `apps/web/src/domains` (`watchdog/no-cross-domain-relative-imports`).
 * Relative paths stay legal inside the domain, tests included. Probe files are written
 * into a throwaway repo that carries the real config and plugin (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/no-cross-domain-relative-imports";
const SRC = "apps/web/src";

const createFixture = oxlintFixtureFactory();

let result: LintResult;

const imp = (specifier: string) =>
  `import { a } from "${specifier}";\nexport { a };\n`;

/** Path (under apps/web/src) to source; each must report exactly once. */
const FAIL: Record<string, string> = {
  "domains/cases/components/other-domain.ts": imp("../../entities/lib/a"),
  "domains/cases/components/shared.ts": imp("../../../shared/ui/a.ts"),
  "domains/cases/components/root-lib.ts": imp("../../../lib/utils"),
  "domains/cases/components/routes.ts": imp("../../../routes/a"),
  "domains/cases/components/domains-root.ts": imp("../../a"),
  "domains/cases/lib/sibling-domain.ts": imp("../../entities/types"),
  "domains/cases/lib/__tests__/test-file.test.ts": imp(
    "../../../../shared/ui/vocab/edge-predicate.ts"
  ),
  "domains/cases/lib/__tests__/test-other-domain.test.ts": imp(
    "../../../entities/lib/a"
  ),
  "domains/cases/components/graph/deep.ts": imp("../../../../shared/ui/a"),
  "domains/cases/components/reexport.ts":
    'export { a } from "../../entities/lib/a";\n',
  "domains/cases/components/reexport-all.ts":
    'export * from "../../entities/lib/a";\n',
  "domains/cases/components/dynamic.ts":
    'export const load = () => import("../../entities/lib/a");\n',
  "domains/cases/components/import-type.ts":
    'export type A = import("../../entities/types").EntityRecord;\n',
  "domains/entities/claims/cross.ts": imp("../../cases/lib/a"),
};

const OK: Record<string, string> = {
  "domains/cases/components/sibling.ts": imp("./sibling-helper"),
  "domains/cases/components/up-in-domain.ts": imp("../lib/a"),
  "domains/cases/components/up-to-domain-root.ts": imp("../types"),
  "domains/cases/components/graph/deep-in-domain.ts": imp("../../lib/a"),
  "domains/cases/components/graph/deep-sibling.ts": imp("../sibling"),
  "domains/cases/lib/__tests__/in-domain.test.ts": imp("../a.ts"),
  "domains/cases/lib/__tests__/in-domain-types.test.ts": imp("../../types.ts"),
  "domains/entities/claims/same-domain.ts": imp("../lib/a"),
  "domains/entities/claims/same-domain-child.ts": imp("../edges/types"),
  "domains/cases/components/alias-domain.ts": imp("@/domains/entities/lib/a"),
  "domains/cases/components/alias-shared.ts": imp("@/shared/ui/a"),
  "domains/cases/components/package.ts": imp("@watchdog/schemas/shared"),
  "domains/cases/components/bare.ts": imp("zod"),
  "domains/cases/components/outside-src.ts": imp("../../../../e2e/a"),
  "domains/cases/components/dynamic-variable.ts":
    "export const load = (p: string) => import(p);\n",
  "domains/cases/components/comment.ts":
    '// import { a } from "../../entities/lib/a";\nexport const a = 1;\n',
  "shared/lib/relative.ts": imp("../ui/a"),
  "routes/relative.ts": imp("../domains/cases/a"),
  "lib/relative.ts": imp("../domains/cases/a"),
};

beforeAll(() => {
  const fixture = createFixture();
  for (const [name, source] of Object.entries(FAIL)) {
    fixture.write(`${SRC}/${name}`, source);
  }
  for (const [name, source] of Object.entries(OK)) {
    fixture.write(`${SRC}/${name}`, source);
  }
  fixture.write(
    "packages/core/src/domains/cases/x.ts",
    imp("../../entities/lib/a")
  );
  result = fixture.lint([SRC, "packages"]);
}, LINT_TIMEOUT_MS);

const hits = (rel: string) => findingsFor(result, `${SRC}/${rel}`, RULE);

describe("cross-domain imports use the alias (no-cross-domain-relative-imports)", () => {
  it.each(Object.keys(FAIL))("rejects %s", (rel) => {
    expect(hits(rel)).toHaveLength(1);
  });

  it("names the alias to use, the convention and the line", () => {
    const [hit] = hits("domains/cases/components/other-domain.ts");
    expect(hit?.message).toContain("../../entities/lib/a");
    expect(hit?.message).toContain("@/domains/entities/lib/a");
    expect(hit?.message).toContain(
      "conventions: imports that leave a domain use the @/ alias"
    );
    expect(hit?.line).toBe(1);
  });

  it.each(Object.keys(OK))("allows %s", (rel) => {
    expect(hits(rel)).toHaveLength(0);
  });

  it("ignores trees outside apps/web/src/domains", () => {
    expect(
      findingsFor(result, "packages/core/src/domains/cases/x.ts", RULE)
    ).toHaveLength(0);
  });
});
