/**
 * Proves the real `oxlint.config.ts` keeps `apps/web/src/shared/**` free of domain, app and
 * route imports (#621): cross-domain wiring lives in `src/app/`. Probe files are written
 * into a throwaway repo that carries the real config (helpers/oxlint-fixture.ts); the
 * list machinery and the primitives wrappers have their own `no-restricted-imports`
 * override, so each is probed too.
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  findingsFor,
  LINT_TIMEOUT_MS,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "eslint/no-restricted-imports";
const SRC = "apps/web/src";

const createFixture = oxlintFixtureFactory();

let result: LintResult;

const FAIL = {
  "shared/lib/domain-alias.ts":
    'import { casesKeys } from "@/domains/cases/queries";\nexport const x = casesKeys;\n',
  "shared/hooks/domain-relative.ts":
    'import { casesKeys } from "../../domains/cases/queries";\nexport const x = casesKeys;\n',
  "shared/ui/domain-barrel.tsx":
    'import { x } from "@/domains/cases";\nexport const y = x;\n',
  "shared/layout/app-alias.tsx":
    'import { AppShell } from "@/app/layout/app-shell";\nexport const y = AppShell;\n',
  "shared/ui/route-alias.tsx":
    'import { Route } from "@/routes/_protected";\nexport const y = Route;\n',
  "shared/lib/list/domain-in-list-machinery.ts":
    'import { casesKeys } from "@/domains/cases/queries";\nexport const x = casesKeys;\n',
  "shared/hooks/list/domain-in-list-hook.ts":
    'import { casesKeys } from "@/domains/cases/queries";\nexport const x = casesKeys;\n',
  "shared/ui/primitives/domain-in-wrapper.tsx":
    'import { casesKeys } from "@/domains/cases/queries";\nexport const x = casesKeys;\n',
  "shared/ui/__tests__/domain-in-test.test.ts":
    'import { casesKeys } from "@/domains/cases/queries";\nexport const x = casesKeys;\n',
} as const;

const OK = {
  "shared/lib/schemas-ok.ts":
    'import { entitySlugSchema } from "@watchdog/schemas/shared";\nexport const x = entitySlugSchema;\n',
  "shared/ui/sibling-ok.tsx":
    'import { cn } from "@/lib/utils";\nexport const x = cn;\n',
  "domains/cases/app-ok.ts":
    'import { invalidateAfterCaseSwitch } from "@/app/lib/query-invalidation";\nexport const x = invalidateAfterCaseSwitch;\n',
  "app/lib/domain-ok.ts":
    'import { casesKeys } from "@/domains/cases/queries";\nexport const x = casesKeys;\n',
} as const;

beforeAll(() => {
  const fixture = createFixture();
  for (const [path, source] of Object.entries({ ...FAIL, ...OK })) {
    fixture.write(`${SRC}/${path}`, source);
  }
  result = fixture.lint([SRC]);
}, LINT_TIMEOUT_MS);

describe("shared imports no domain (no-restricted-imports)", () => {
  it.each(Object.keys(FAIL))("rejects %s", (path) => {
    expect(findingsFor(result, `${SRC}/${path}`, RULE)).toHaveLength(1);
  });
  it.each(Object.keys(OK))("allows %s", (path) => {
    expect(findingsFor(result, `${SRC}/${path}`, RULE)).toHaveLength(0);
  });
});
