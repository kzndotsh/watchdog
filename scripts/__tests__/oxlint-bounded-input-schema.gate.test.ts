/**
 * Proves the real `oxlint.config.ts` enforces `watchdog/bounded-input-schema`: in the
 * input-schema modules of `packages/schemas/src` and in `packages/api/src/procedures`, a
 * `z.string()`, `z.array()`, `z.url()` or `z.email()` in an input schema needs a `.max()`
 * or `.length()`. Probe files are written into a throwaway repo that carries the real
 * config and plugin (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { findingsFor, oxlintFixtureFactory } from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const SCHEMAS = "packages/schemas/src";
const PROCEDURES = "packages/api/src/procedures";
const RULE = "watchdog/bounded-input-schema";
const Z = 'import { z } from "zod";\n\n';

const FAIL_CASES = {
  "string-bare": `${Z}export const createThingInputSchema = z.object({ name: z.string() });\n`,
  "string-trim-nonempty": `${Z}export const createThingInputSchema = z.object({ name: z.string().trim().min(1) });\n`,
  "string-optional": `${Z}export const createThingInputSchema = z.object({ name: z.string().optional() });\n`,
  "string-in-union": `${Z}export const createThingInputSchema = z.object({ note: z.union([z.null(), z.string()]) });\n`,
  "string-in-preprocess": `${Z}export const createThingInputSchema = z.object({ note: z.preprocess((v) => v, z.string().optional()) });\n`,
  "array-bare": `${Z}export const listThingsInputSchema = z.object({ ids: z.array(z.uuid()) });\n`,
  "array-min-only": `${Z}export const listThingsInputSchema = z.object({ ids: z.array(z.uuid()).min(1) });\n`,
  "array-of-unbounded-strings": `${Z}export const listThingsInputSchema = z.object({ ids: z.array(z.string()).max(10) });\n`,
  "url-bare": `${Z}export const createThingInputSchema = z.object({ url: z.url() });\n`,
  "email-bare": `${Z}export const createThingInputSchema = z.object({ email: z.email() });\n`,
  "fields-schema": `${Z}export const thingFieldsSchema = z.object({ name: z.string() });\n`,
  "filters-schema": `${Z}export const thingFiltersSchema = z.object({ q: z.string() });\n`,
  "name-ends-input": `${Z}export const entityInput = z.object({ name: z.string() });\n`,
  "piped-unbounded": `${Z}export const createThingInputSchema = z.object({ name: z.string().pipe(z.string().min(1)) });\n`,
  "extend-inline": `${Z}const base = z.object({});\nexport const createThingInputSchema = base.extend({ name: z.string() });\n`,
} as const;

const PASS_CASES = {
  "string-max": `${Z}export const createThingInputSchema = z.object({ name: z.string().trim().min(1).max(256) });\n`,
  "string-length": `${Z}export const createThingInputSchema = z.object({ sha: z.string().length(64) });\n`,
  "string-max-first": `${Z}export const createThingInputSchema = z.object({ name: z.string().max(10).optional() });\n`,
  "array-max": `${Z}export const listThingsInputSchema = z.object({ ids: z.array(z.uuid()).max(100) });\n`,
  "array-length": `${Z}export const listThingsInputSchema = z.object({ ids: z.array(z.uuid()).length(2) });\n`,
  "array-of-bounded": `${Z}export const listThingsInputSchema = z.object({ ids: z.array(z.string().max(36)).max(10) });\n`,
  "url-max": `${Z}export const createThingInputSchema = z.object({ url: z.url().max(2048) });\n`,
  "piped-from-bounded": `${Z}export const createThingInputSchema = z.object({ name: z.string().trim().max(10).pipe(z.string().min(1)) });\n`,
  "enum-and-uuid": `${Z}export const createThingInputSchema = z.object({ kind: z.enum(["a", "b"]), id: z.uuid() });\n`,
  "output-schema-name": `${Z}export const thingSchema = z.object({ name: z.string(), ids: z.array(z.uuid()) });\n`,
  "output-list-name": `${Z}export const thingListSchema = z.array(z.string());\n`,
  "not-zod":
    "export const names = Array.from({ length: 3 }, () => String(1));\n",
} as const;

const PROCEDURE_FAIL = {
  "inline-input-string": `${Z}export const a = { input: (s: unknown) => s };\nexport const b = a.input(z.object({ name: z.string() }));\n`,
  "named-input-array": `${Z}export const listInputSchema = z.object({ ids: z.array(z.uuid()) });\n`,
} as const;

const PROCEDURE_PASS = {
  "inline-input-bounded": `${Z}export const a = { input: (s: unknown) => s };\nexport const b = a.input(z.object({ name: z.string().max(10) }));\n`,
  "output-array": `${Z}export const a = { output: (s: unknown) => s };\nexport const b = a.output(z.array(z.string()));\n`,
  "output-nested-string": `${Z}const wire = z.object({ name: z.string() });\nexport const a = { output: (s: unknown) => s };\nexport const b = a.output(z.object({ items: z.array(wire), url: z.string().nullable() }));\n`,
} as const;

/** Primitive modules count whole-file: every declaration there is an input building block. */
const WHOLE_FILE = {
  "primitives.ts": `${Z}export const nameSchema = z.string().trim();\n`,
  "ids.ts": `${Z}export const orgIdSchema = z.string().min(1);\n`,
  "patch.ts": `${Z}export const patchListSchema = z.array(z.uuid());\n`,
} as const;

const createFixture = oxlintFixtureFactory();

let result: LintResult;

beforeAll(() => {
  const fixture = createFixture();
  for (const [name, src] of Object.entries({ ...FAIL_CASES, ...PASS_CASES })) {
    fixture.write(`${SCHEMAS}/${name}.ts`, src);
  }
  for (const [name, src] of Object.entries({
    ...PROCEDURE_FAIL,
    ...PROCEDURE_PASS,
  })) {
    fixture.write(`${PROCEDURES}/${name}.ts`, src);
  }
  for (const [name, src] of Object.entries(WHOLE_FILE)) {
    fixture.write(`${SCHEMAS}/${name}`, src);
  }
  // The same violating source in a test, a fixture folder and another package.
  fixture.write(
    `${SCHEMAS}/__tests__/probe.test.ts`,
    FAIL_CASES["string-bare"]
  );
  fixture.write(`${SCHEMAS}/testing/probe.ts`, FAIL_CASES["string-bare"]);
  fixture.write("packages/core/src/probe.ts", FAIL_CASES["string-bare"]);
  fixture.write(
    `${PROCEDURES}/__tests__/probe.test.ts`,
    PROCEDURE_FAIL["named-input-array"]
  );
  result = fixture.lint([SCHEMAS, PROCEDURES, "packages/core/src/probe.ts"]);
});

const hits = (file: string) => findingsFor(result, file, RULE);

describe("bounded-input-schema (oxlint.config.ts)", () => {
  for (const name of Object.keys(FAIL_CASES)) {
    it(`rejects ${name}`, () => {
      expect(hits(`${SCHEMAS}/${name}.ts`)).not.toHaveLength(0);
    });
  }
  for (const name of Object.keys(PASS_CASES)) {
    it(`allows ${name}`, () => {
      expect(hits(`${SCHEMAS}/${name}.ts`)).toHaveLength(0);
    });
  }
  for (const name of Object.keys(PROCEDURE_FAIL)) {
    it(`rejects ${name} in procedures`, () => {
      expect(hits(`${PROCEDURES}/${name}.ts`)).not.toHaveLength(0);
    });
  }
  for (const name of Object.keys(PROCEDURE_PASS)) {
    it(`allows ${name} in procedures`, () => {
      expect(hits(`${PROCEDURES}/${name}.ts`)).toHaveLength(0);
    });
  }
  for (const name of Object.keys(WHOLE_FILE)) {
    it(`treats every schema in ${name} as an input schema`, () => {
      expect(hits(`${SCHEMAS}/${name}`)).not.toHaveLength(0);
    });
  }
  it("does not apply to tests, fixtures or other packages", () => {
    expect(hits(`${SCHEMAS}/__tests__/probe.test.ts`)).toHaveLength(0);
    expect(hits(`${SCHEMAS}/testing/probe.ts`)).toHaveLength(0);
    expect(hits(`${PROCEDURES}/__tests__/probe.test.ts`)).toHaveLength(0);
    expect(hits("packages/core/src/probe.ts")).toHaveLength(0);
  });
  it("reports once per unbounded schema, at its use site, with the fix", () => {
    const found = hits(`${SCHEMAS}/string-bare.ts`);
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain("z.string()");
    expect(found[0]?.message).toContain(".max(");
    expect(found[0]?.message).toContain("conventions");
    expect(found[0]?.line).toBe(3);
  });
  it("names the array constructor for an unbounded list", () => {
    expect(hits(`${SCHEMAS}/array-bare.ts`)[0]?.message).toContain("z.array()");
  });
});
