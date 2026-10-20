import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { createCaseInputSchema } from "../case-create";
import { createClaimInputSchema } from "../claim-create";
import { putCredentialInputSchema } from "../credential-put";
import { createEntityInputSchema } from "../entity-create";
import { dumpPasteInputSchema } from "../evidence-ingest";
import { graphHistorySnapshotSchema } from "../graph-history";
import { jsonObjectSchema } from "../json-wire";
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
import { patchOpInputSchema, patchOpSchema } from "../patch";
import {
  httpUrlSchema,
  inputJsonValueSchema,
  optionalHttpUrlSchema,
  uuidListSchema,
} from "../primitives";
import { proposalPatchFieldsSchema } from "../proposal-ingress";
import { taskCreateInputSchema } from "../tasks";
import { testCaseId } from "../testing";

const caseId = testCaseId(1);
const entityId = "00000000-0000-4000-8000-000000000001";
const op0 = {
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
    build: (n) => `https://example.com/${"u".repeat(Math.max(0, n - 20))}`,
  },
  secret: {
    schema: putCredentialInputSchema,
    build: (n) => ({ name: "API_KEY", secret: "s".repeat(n) }),
  },
  array: {
    schema: proposalPatchFieldsSchema,
    build: (n) => ({ patch: Array.from({ length: n }, () => op0) }),
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
    expect(inputJsonValueSchema.safeParse("j".repeat(BODY_MAX)).success).toBe(
      true
    );
    expect(
      inputJsonValueSchema.safeParse("j".repeat(BODY_MAX + 1)).success
    ).toBe(false);
    expect(
      inputJsonValueSchema.safeParse(Array.from({ length: ARRAY_MAX }, () => 1))
        .success
    ).toBe(true);
    expect(
      inputJsonValueSchema.safeParse(
        Array.from({ length: ARRAY_MAX + 1 }, () => 1)
      ).success
    ).toBe(false);
    expect(
      inputJsonValueSchema.safeParse({ ["k".repeat(NAME_MAX + 1)]: 1 }).success
    ).toBe(false);
  });

  it("trims a URL before counting it, so a padded maximum is accepted", () => {
    const url = `https://example.com/${"u".repeat(URL_MAX - 20)}`;
    expect(optionalHttpUrlSchema.safeParse(`  ${url}  `).success).toBe(true);
    expect(optionalHttpUrlSchema.safeParse(`${url}u`).success).toBe(false);
  });

  describe("stored data is not held to the input limits", () => {
    const bigIds = Array.from({ length: ARRAY_MAX + 1 }, () => entityId);

    it("reads a history snapshot with more items than an input may carry", () => {
      const snapshot = {
        evidenceIds: bigIds,
        body: "b".repeat(BODY_MAX + 1),
        [`k${"x".repeat(NAME_MAX)}`]: 1,
      };
      expect(graphHistorySnapshotSchema.safeParse(snapshot).success).toBe(true);
      expect(jsonObjectSchema.safeParse(snapshot).success).toBe(true);
      expect(inputJsonValueSchema.safeParse(snapshot).success).toBe(false);
    });

    it("reads a stored patch op with more Evidence ids than an input may carry", () => {
      const op = { ...op0, evidenceIds: bigIds };
      expect(patchOpSchema.safeParse(op).success).toBe(true);
      expect(patchOpInputSchema.safeParse(op).success).toBe(false);
    });
  });
});
