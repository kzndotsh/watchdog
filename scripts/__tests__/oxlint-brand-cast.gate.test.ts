/**
 * Proves the real `oxlint.config.ts` bans bare casts to the branded id types
 * (`as OrganizationId`, `as CaseId`, `as unknown as CaseId`, `<CaseId>x`) outside
 * `packages/schemas/src/testing`, while constructors, other casts and the schemas testing fixtures stay
 * allowed. Probe files are written into a throwaway repo that carries the real config
 * and plugin (helpers/oxlint-fixture.ts); nothing touches the working tree.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { findingsFor, oxlintFixtureFactory } from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/no-brand-cast";
const PROBE = "packages/core/src/probe";
const EXEMPT = "packages/schemas/src/testing/probe";

const TYPES =
  'import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";\n';

const FAIL_CASES = {
  "as-organization-id": `${TYPES}export const a = (v: string) => v as OrganizationId;\n`,
  "as-case-id": `${TYPES}export const a = (v: string) => v as CaseId;\n`,
  "as-unknown-as": `${TYPES}export const a = (v: string) => v as unknown as CaseId;\n`,
  "as-union-null": `${TYPES}export const a = (v: string) => v as CaseId | null;\n`,
  "as-array": `${TYPES}export const a = (v: string[]) => v as CaseId[];\n`,
  "as-readonly-array": `${TYPES}export const a = (v: string[]) => v as readonly CaseId[];\n`,
  "as-record": `${TYPES}export const a = (v: object) => v as Record<string, CaseId>;\n`,
  "as-generic": `${TYPES}export const a = (v: object) => v as Set<OrganizationId>;\n`,
  "as-object": `${TYPES}export const a = (v: object) => v as { id: CaseId };\n`,
  "as-tuple": `${TYPES}export const a = (v: object) => v as [CaseId, OrganizationId];\n`,
  "as-unknown-as-union": `${TYPES}export const a = (v: string) => v as unknown as CaseId | null;\n`,
  "as-unknown-as-array": `${TYPES}export const a = (v: string) => v as unknown as CaseId[];\n`,
  "as-brand-marker": `import type { z } from "zod";\n\nexport const a = (v: string) => v as string & z.BRAND<"CaseId">;\n`,
  "as-brand-marker-org": `import type { BRAND } from "zod";\n\nexport const a = (v: string) => v as string & BRAND<"OrganizationId">;\n`,
  "as-aliased-import": `import type { CaseId as C } from "@watchdog/schemas/shared";\n\nexport const a = (v: string) => v as C;\n`,
  "angle-bracket-array": `${TYPES}export const a = (v: string[]) => <CaseId[]>v;\n`,
} as const;

const PASS_CASES = {
  constructor: `import { asCaseId } from "@watchdog/schemas/shared";\n\nexport const a = (v: string) => asCaseId(v);\n`,
  "other-cast": `${TYPES}export type A = CaseId;\nexport const a = (v: unknown) => v as string;\n`,
  "annotation-union": `${TYPES}export const a = (v: CaseId | null): CaseId | null => v;\nexport const b: CaseId | null = null;\n`,
  "promise-return": `${TYPES}export const a = async (v: CaseId): Promise<CaseId> => v;\n`,
  satisfies: `${TYPES}export const a = (v: CaseId) => v satisfies CaseId;\n`,
  "unrelated-generic-cast": `${TYPES}export type A = CaseId[];\nexport const a = (v: unknown) => v as Record<string, string[]>;\n`,
  "unrelated-brand": `import type { z } from "zod";\n\nexport const a = (v: string) => v as string & z.BRAND<"Other">;\n`,
  "similar-name": `export type CaseIdLike = string;\nexport const a = (v: string) => v as CaseIdLike;\n`,
} as const;

const createFixture = oxlintFixtureFactory();

let result: LintResult;

beforeAll(() => {
  const fixture = createFixture();
  for (const [name, src] of Object.entries({ ...FAIL_CASES, ...PASS_CASES })) {
    fixture.write(`${PROBE}/${name}.ts`, src);
  }
  fixture.write(`${EXEMPT}/exempt.ts`, FAIL_CASES["as-case-id"]);
  result = fixture.lint([PROBE, EXEMPT]);
});

const hitsFor = (file: string) => findingsFor(result, file, RULE);

describe("branded id cast ban (oxlint.config.ts)", () => {
  it.each(Object.keys(FAIL_CASES))("rejects %s", (name) => {
    expect(hitsFor(`${PROBE}/${name}.ts`)).not.toHaveLength(0);
  });
  it.each(Object.keys(PASS_CASES))("allows %s", (name) => {
    expect(hitsFor(`${PROBE}/${name}.ts`)).toHaveLength(0);
  });
  it("exempts packages/schemas/src/testing fixtures", () => {
    expect(hitsFor(`${EXEMPT}/exempt.ts`)).toHaveLength(0);
  });
  it("reports the message and the cast location", () => {
    const [hit] = hitsFor(`${PROBE}/as-case-id.ts`);
    expect(hit?.message).toContain("Do not cast to a type containing CaseId");
    expect(hit?.message).toContain("asCaseId");
    expect(hit?.line).toBe(2);
  });
});
