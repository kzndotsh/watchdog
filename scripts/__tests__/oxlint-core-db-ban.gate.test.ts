/**
 * Proves the real `oxlint.config.ts` bans the global `db` client in
 * `packages/core/src` (static, aliased, namespace and dynamic imports) while
 * type imports and repo imports stay allowed. Probe files are written into a
 * throwaway repo that carries the real config and plugin (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const PROBE = "packages/core/src/probe";

const FAIL_CASES = {
  named: 'import { db } from "@watchdog/db";\nexport const a = db;\n',
  aliased: 'import { db as x } from "@watchdog/db";\nexport const a = x;\n',
  namespace: 'import * as m from "@watchdog/db";\nexport const a = m;\n',
  dynamic: 'export const a = async () => await import("@watchdog/db");\n',
  "dynamic-bare": 'export const a = () => import("@watchdog/db");\n',
} as const;

const PASS_CASES = {
  "type-import":
    'import type { DbExec } from "@watchdog/db";\nexport type A = DbExec;\n',
  "repo-import":
    'import { casesRepo } from "@watchdog/db";\n\nexport const a = casesRepo;\n',
  "other-dynamic": 'export const a = () => import("@watchdog/log");\n',
} as const;

const RESTRICTED =
  /^(eslint\/no-restricted-imports|watchdog\/no-core-db-dynamic-import)$/;

const createFixture = oxlintFixtureFactory();

let result: LintResult;

beforeAll(() => {
  const fixture = createFixture();
  for (const [name, src] of Object.entries({ ...FAIL_CASES, ...PASS_CASES })) {
    fixture.write(`${PROBE}/${name}.ts`, src);
  }
  result = fixture.lint([PROBE]);
}, LINT_TIMEOUT_MS);

const restrictedFor = (name: string) =>
  findingsFor(result, `${PROBE}/${name}.ts`).filter((f) =>
    RESTRICTED.test(f.rule)
  );

describe("core global-db import ban (oxlint.config.ts)", () => {
  for (const name of Object.keys(FAIL_CASES)) {
    it(`rejects ${name}`, () => {
      expect(restrictedFor(name)).not.toHaveLength(0);
    });
  }
  for (const name of Object.keys(PASS_CASES)) {
    it(`allows ${name}`, () => {
      expect(restrictedFor(name)).toHaveLength(0);
    });
  }
  it("reports the dynamic import with its fix and location", () => {
    const [hit] = findingsFor(
      result,
      `${PROBE}/dynamic.ts`,
      "watchdog/no-core-db-dynamic-import"
    );
    expect(hit?.message).toContain("Db service");
    expect(hit?.line).toBe(1);
  });
});
