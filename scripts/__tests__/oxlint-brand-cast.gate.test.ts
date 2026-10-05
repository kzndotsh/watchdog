/**
 * Proves the real `oxlint.config.ts` bans bare casts to the branded id types
 * (`as OrganizationId`, `as CaseId`, `as unknown as CaseId`, `<CaseId>x`) outside
 * `packages/test-kit`, while constructors, other casts and the test-kit fixtures stay
 * allowed. Probe files are written under covered paths (the config's `files` globs are
 * repo-relative) and removed after.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const coreSrc = path.join(repoRoot, "packages/core/src");
const testKitSrc = path.join(repoRoot, "packages/test-kit/src");

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

let coreProbeDir = "";
let kitProbeDir = "";
let output = "";

beforeAll(() => {
  coreProbeDir = mkdtempSync(path.join(coreSrc, "__oxlint-probe-"));
  kitProbeDir = mkdtempSync(path.join(testKitSrc, "__oxlint-probe-"));
  for (const [name, src] of Object.entries({ ...FAIL_CASES, ...PASS_CASES })) {
    writeFileSync(path.join(coreProbeDir, `${name}.ts`), src);
  }
  writeFileSync(path.join(kitProbeDir, "exempt.ts"), FAIL_CASES["as-case-id"]);
  const res = spawnSync(
    path.join(repoRoot, "node_modules/.bin/oxlint"),
    [
      "-c",
      "oxlint.config.ts",
      path.relative(repoRoot, coreProbeDir),
      path.relative(repoRoot, kitProbeDir),
    ],
    { cwd: repoRoot, encoding: "utf-8" }
  );
  output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
});

afterAll(() => {
  if (coreProbeDir) rmSync(coreProbeDir, { recursive: true, force: true });
  if (kitProbeDir) rmSync(kitProbeDir, { recursive: true, force: true });
});

const hitsFor = (dir: string, name: string) =>
  output
    .split("\n")
    .filter((line) => line.includes(`${path.basename(dir)}/${name}.ts:`))
    .filter((line) => line.includes("no-brand-cast"));

describe("branded id cast ban (oxlint.config.ts)", () => {
  it.each(Object.keys(FAIL_CASES))("rejects %s", (name) => {
    expect(hitsFor(coreProbeDir, name)).not.toHaveLength(0);
  });
  it.each(Object.keys(PASS_CASES))("allows %s", (name) => {
    expect(hitsFor(coreProbeDir, name)).toHaveLength(0);
  });
  it("exempts packages/test-kit fixtures", () => {
    expect(hitsFor(kitProbeDir, "exempt")).toHaveLength(0);
  });
});
