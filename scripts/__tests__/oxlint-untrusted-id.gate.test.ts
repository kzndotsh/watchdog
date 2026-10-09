/**
 * Proves the real `oxlint.config.ts` only lets tests and test-helper trees import the
 * unvalidated brand stampers `untrustedCaseId` / `untrustedOrganizationId` from
 * `@watchdog/schemas/testing` (ADR-0003). Probe files are written into a throwaway
 * repo that carries the real config and plugin (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { findingsFor, oxlintFixtureFactory } from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/no-untrusted-id-import";
const PROD = "packages/core/src/probe";
const SCHEMAS_TESTING = "packages/schemas/src/testing/probe";
const CAPS_TESTING = "packages/caps/src/testing/probe";

const IMPORT =
  'import { untrustedCaseId } from "@watchdog/schemas/testing";\n\nexport const a = untrustedCaseId("x");\n';
const IMPORT_FIXTURES =
  'import { untrustedOrganizationId as o } from "@watchdog/schemas/testing";\n\nexport const a = o("x");\n';
const REEXPORT =
  'export { untrustedOrganizationId } from "@watchdog/schemas/testing";\n';
const SAFE =
  'import { testCaseId } from "@watchdog/schemas/testing";\n\nexport const a = testCaseId(1);\n';

const createFixture = oxlintFixtureFactory();

let result: LintResult;

beforeAll(() => {
  const fixture = createFixture();
  fixture.write(`${PROD}/prod-import.ts`, IMPORT);
  fixture.write(`${PROD}/prod-aliased.ts`, IMPORT_FIXTURES);
  fixture.write(`${PROD}/prod-reexport.ts`, REEXPORT);
  fixture.write(`${PROD}/prod-safe.ts`, SAFE);
  fixture.write(`${PROD}/in-test.test.ts`, IMPORT);
  fixture.write(`${PROD}/__tests__/in-tests-dir.ts`, IMPORT);
  fixture.write(`${SCHEMAS_TESTING}/kit.ts`, IMPORT);
  fixture.write(`${CAPS_TESTING}/helper.ts`, IMPORT);
  result = fixture.lint([PROD, SCHEMAS_TESTING, CAPS_TESTING]);
});

const hitsFor = (file: string) => findingsFor(result, file, RULE);

describe("untrusted id helper import ban (oxlint.config.ts)", () => {
  it.each(["prod-import.ts", "prod-aliased.ts", "prod-reexport.ts"])(
    "rejects %s in a production file",
    (file) => {
      expect(hitsFor(`${PROD}/${file}`)).not.toHaveLength(0);
    }
  );
  it("allows other test-kit imports in production files", () => {
    expect(hitsFor(`${PROD}/prod-safe.ts`)).toHaveLength(0);
  });
  it("allows *.test.ts", () => {
    expect(hitsFor(`${PROD}/in-test.test.ts`)).toHaveLength(0);
  });
  it("allows __tests__ directories", () => {
    expect(hitsFor(`${PROD}/__tests__/in-tests-dir.ts`)).toHaveLength(0);
  });
  it("allows packages/schemas testing and caps testing helpers", () => {
    expect(hitsFor(`${SCHEMAS_TESTING}/kit.ts`)).toHaveLength(0);
    expect(hitsFor(`${CAPS_TESTING}/helper.ts`)).toHaveLength(0);
  });
  it("reports the helper name, the fix and the import location", () => {
    const [hit] = hitsFor(`${PROD}/prod-import.ts`);
    expect(hit?.message).toContain(
      "untrustedCaseId stamps an unvalidated brand"
    );
    expect(hit?.message).toContain("asCaseId");
    expect(hit?.line).toBe(1);
  });
});
