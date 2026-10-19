import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { createCaseInputSchema } from "../case-create";
import { createClaimInputSchema } from "../claim-create";
import { putCredentialInputSchema } from "../credential-put";
import { createEntityInputSchema } from "../entity-create";
import { dumpPasteInputSchema } from "../evidence-ingest";
import {
  ARRAY_MAX,
  BODY_MAX,
  INPUT_LIMITS,
  NAME_MAX,
  NOTES_MAX,
  SECRET_MAX,
  SLUG_MAX,
  TITLE_MAX,
  URL_MAX,
} from "../limits";
import type { InputLimitName } from "../limits";
import { httpUrlSchema, jsonValueSchema, uuidListSchema } from "../primitives";
import { proposalPatchFieldsSchema } from "../proposal-ingress";
import { taskCreateInputSchema } from "../tasks";
import { testCaseId } from "../testing";

const caseId = testCaseId(1);
const entityId = "00000000-0000-4000-8000-000000000001";
const op = {
  op: "create",
  resource: "entity",
  id: entityId,
  data: { name: "x" },
};

type Probe = {
  /** Schema whose parse of `build(length)` accepts exactly `INPUT_LIMITS[name]`. */
  readonly schema: z.ZodType;
  readonly build: (length: number) => unknown;
};

/** One probe per named limit: the schema the limit guards most directly. */
const PROBES: Record<InputLimitName, Probe> = {
  name: {
    schema: createEntityInputSchema,
    build: (n) => ({ caseId, kind: "person", name: "n".repeat(n) }),
  },
  slug: {
    schema: createCaseInputSchema,
    build: (n) => ({ name: "Case", slug: "s".repeat(n) }),
  },
  title: {
    schema: taskCreateInputSchema,
    build: (n) => ({ caseId, title: "t".repeat(n) }),
  },
  notes: {
    schema: createClaimInputSchema,
    build: (n) => ({
      caseId,
      entityId,
      text: "c".repeat(n),
      confidence: "unverified",
    }),
  },
  body: {
    schema: dumpPasteInputSchema,
    build: (n) => ({ caseId, body: "b".repeat(n) }),
  },
  url: {
    schema: httpUrlSchema,
    build: (n) => `https://example.com/${"u".repeat(n - 20)}`,
  },
  secret: {
    schema: putCredentialInputSchema,
    build: (n) => ({ name: "API_KEY", secret: "s".repeat(n) }),
  },
  array: {
    schema: proposalPatchFieldsSchema,
    build: (n) => ({ patch: Array.from({ length: n }, () => op) }),
  },
};

describe("named input limits", () => {
  it("covers every named limit", () => {
    expect(new Set(Object.keys(PROBES))).toEqual(
      new Set(Object.keys(INPUT_LIMITS))
    );
  });

  it("exports each limit as a constant with its table value", () => {
    expect({ NAME_MAX, SLUG_MAX, TITLE_MAX, NOTES_MAX }).toEqual({
      NAME_MAX: INPUT_LIMITS.name,
      SLUG_MAX: INPUT_LIMITS.slug,
      TITLE_MAX: INPUT_LIMITS.title,
      NOTES_MAX: INPUT_LIMITS.notes,
    });
    expect({ BODY_MAX, URL_MAX, SECRET_MAX, ARRAY_MAX }).toEqual({
      BODY_MAX: INPUT_LIMITS.body,
      URL_MAX: INPUT_LIMITS.url,
      SECRET_MAX: INPUT_LIMITS.secret,
      ARRAY_MAX: INPUT_LIMITS.array,
    });
  });

  for (const name of Object.keys(PROBES) as InputLimitName[]) {
    const max = INPUT_LIMITS[name];
    const { schema, build } = PROBES[name];
    it(`${name}: accepts ${max} and rejects ${max + 1}`, () => {
      expect(schema.safeParse(build(max)).success).toBe(true);
      expect(schema.safeParse(build(max + 1)).success).toBe(false);
    });
  }

  it("counts length after trimming", () => {
    const padded = `  ${"n".repeat(NAME_MAX)}  `;
    expect(
      createEntityInputSchema.safeParse({
        caseId,
        kind: "person",
        name: padded,
      }).success
    ).toBe(true);
  });

  it("bounds a list of ids and each id in it", () => {
    const id = entityId;
    expect(
      uuidListSchema.safeParse(Array.from({ length: ARRAY_MAX }, () => id))
        .success
    ).toBe(true);
    expect(
      uuidListSchema.safeParse(Array.from({ length: ARRAY_MAX + 1 }, () => id))
        .success
    ).toBe(false);
    expect(uuidListSchema.safeParse(["x".repeat(NAME_MAX + 1)]).success).toBe(
      false
    );
  });

  it("bounds strings, arrays and keys inside a JSON payload", () => {
    expect(jsonValueSchema.safeParse("j".repeat(BODY_MAX)).success).toBe(true);
    expect(jsonValueSchema.safeParse("j".repeat(BODY_MAX + 1)).success).toBe(
      false
    );
    expect(
      jsonValueSchema.safeParse(Array.from({ length: ARRAY_MAX }, () => 1))
        .success
    ).toBe(true);
    expect(
      jsonValueSchema.safeParse(Array.from({ length: ARRAY_MAX + 1 }, () => 1))
        .success
    ).toBe(false);
    expect(
      jsonValueSchema.safeParse({ ["k".repeat(NAME_MAX + 1)]: 1 }).success
    ).toBe(false);
  });
});
