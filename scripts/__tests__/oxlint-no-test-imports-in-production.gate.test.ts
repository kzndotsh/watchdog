/**
 * Proves the real `oxlint.config.ts` keeps test-only code out of production source: the
 * guard the old second `tsc -p tsconfig.json` pass gave (tests, test helper packages and
 * `.ts` extension imports failed against the production tsconfig). Covers
 * `watchdog/no-test-imports-in-production` and `watchdog/no-ts-extension-import`.
 * Probe files are written into a throwaway repo that carries the real config and plugin
 * (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const TEST_RULE = "watchdog/no-test-imports-in-production";
const EXT_RULE = "watchdog/no-ts-extension-import";
const PROBE = "packages/core/src/probe";

const TEST_IMPORT_FAILS = {
  vitest: 'import { vi } from "vitest";\nexport const a = vi;\n',
  "vitest-subpath":
    'import { it } from "vitest/browser";\nexport const a = it;\n',
  "testing-library":
    'import { render } from "@testing-library/react";\nexport const a = render;\n',
  "test-db":
    'import { seedCase } from "@watchdog/test-db";\nexport const a = seedCase;\n',
  "test-kit-subpath":
    'import { server } from "@watchdog/test-kit/http";\nexport const a = server;\n',
  "type-only": 'import type { Mock } from "vitest";\nexport type A = Mock;\n',
  "re-export": 'export { vi } from "vitest";\n',
  dynamic: 'export const a = () => import("@watchdog/test-db");\n',
  "test-module": 'import { x } from "./x.test";\nexport const a = x;\n',
  "test-module-ext":
    'import type { x } from "../util.test.ts";\nexport type A = typeof x;\n',
  "tests-dir":
    'import { x } from "./__tests__/helpers";\nexport const a = x;\n',
} as const;

const TEST_IMPORT_PASSES = {
  "plain-module": 'import { x } from "./latest";\nexport const a = x;\n',
  "testing-in-file-name":
    'import { x } from "./testing-notes";\nexport const a = x;\n',
  "similar-name":
    'import { x } from "./vitest-config-note";\nexport const a = x;\n',
  package: 'import { Effect } from "effect";\nexport const a = Effect;\n',
  "workspace-package":
    'import { log } from "@watchdog/log";\nexport const a = log;\n',
} as const;

const EXT_FAILS = {
  "value-import": 'import { x } from "./x.ts";\nexport const a = x;\n',
  "tsx-import": 'import { x } from "./x.tsx";\nexport const a = x;\n',
  "re-export": 'export { x } from "./x.ts";\n',
  dynamic: 'export const a = () => import("./x.ts");\n',
} as const;

const EXT_PASSES = {
  extensionless: 'import { x } from "./x";\nexport const a = x;\n',
  "type-import": 'import type { X } from "./x.ts";\nexport type A = X;\n',
  "type-export": 'export type { X } from "./x.ts";\n',
  json: 'import data from "./data.json";\nexport const a = data;\n',
} as const;

/** The same violating sources in trees where the rules are off. */
const EXEMPT = [
  "packages/core/src/__tests__/probe.ts",
  "packages/core/src/probe.test.ts",
  "packages/schemas/src/testing/probe.ts",
  "packages/test-db/src/probe.ts",
  "packages/test-kit/src/probe.ts",
  "apps/web/src/test-setup.ts",
] as const;

const createFixture = oxlintFixtureFactory();

let result: LintResult;

beforeAll(() => {
  const fixture = createFixture();
  for (const [name, src] of Object.entries({
    ...TEST_IMPORT_FAILS,
    ...TEST_IMPORT_PASSES,
  })) {
    fixture.write(`${PROBE}/t-${name}.ts`, src);
  }
  for (const [name, src] of Object.entries({ ...EXT_FAILS, ...EXT_PASSES })) {
    fixture.write(`${PROBE}/e-${name}.ts`, src);
  }
  for (const file of EXEMPT) {
    fixture.write(
      file,
      `${TEST_IMPORT_FAILS.vitest}${EXT_FAILS["value-import"]}`
    );
  }
  // apps/web may import `.ts` (its tsconfig.json allows it) but not test code.
  fixture.write("apps/web/src/probe-ext.ts", EXT_FAILS["value-import"]);
  fixture.write("apps/web/src/probe-test.ts", TEST_IMPORT_FAILS.vitest);
  fixture.write("apps/worker/src/probe-test.ts", TEST_IMPORT_FAILS["test-db"]);
  result = fixture.lint(["packages", "apps"]);
}, LINT_TIMEOUT_MS);

describe("production source imports no test-only code (oxlint.config.ts)", () => {
  it.each(Object.keys(TEST_IMPORT_FAILS))("rejects %s", (name) => {
    expect(
      findingsFor(result, `${PROBE}/t-${name}.ts`, TEST_RULE)
    ).toHaveLength(1);
  });
  it.each(Object.keys(TEST_IMPORT_PASSES))("allows %s", (name) => {
    expect(
      findingsFor(result, `${PROBE}/t-${name}.ts`, TEST_RULE)
    ).toHaveLength(0);
  });
  it("covers apps too", () => {
    expect(
      findingsFor(result, "apps/worker/src/probe-test.ts", TEST_RULE)
    ).toHaveLength(1);
    expect(
      findingsFor(result, "apps/web/src/probe-test.ts", TEST_RULE)
    ).toHaveLength(1);
  });
  it("reports the fix and the location", () => {
    const [hit] = findingsFor(result, `${PROBE}/t-dynamic.ts`, TEST_RULE);
    expect(hit?.message).toContain("@watchdog/test-db");
    expect(hit?.message).toContain("move this file into a test tree");
    expect(hit?.line).toBe(1);
  });
});

describe("production source imports without a .ts extension (oxlint.config.ts)", () => {
  it.each(Object.keys(EXT_FAILS))("rejects %s", (name) => {
    expect(findingsFor(result, `${PROBE}/e-${name}.ts`, EXT_RULE)).toHaveLength(
      1
    );
  });
  it.each(Object.keys(EXT_PASSES))("allows %s", (name) => {
    expect(findingsFor(result, `${PROBE}/e-${name}.ts`, EXT_RULE)).toHaveLength(
      0
    );
  });
  it("leaves apps/web alone, whose tsconfig allows the extension", () => {
    expect(
      findingsFor(result, "apps/web/src/probe-ext.ts", EXT_RULE)
    ).toHaveLength(0);
  });
});

describe("test trees and helper packages are exempt", () => {
  it.each(EXEMPT)("allows %s", (file) => {
    expect(
      findingsFor(result, file).filter(
        (f) => f.rule === TEST_RULE || f.rule === EXT_RULE
      )
    ).toHaveLength(0);
  });
});
