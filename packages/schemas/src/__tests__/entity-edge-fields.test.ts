import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { createEdgeFieldsSchema, createEdgeInputSchema } from "../edge-create";
import { edgeUpdateFieldsSchema, updateEdgeInputSchema } from "../edge-update";
import {
  createEntityFieldsSchema,
  createEntityInputSchema,
} from "../entity-create";

const CASE_ID = testId(0);
const FROM_ID = testId(1);
const TO_ID = testId(2);

describe("createEntityFieldsSchema", () => {
  it("slugifies name when slug is omitted", () => {
    expect(
      createEntityFieldsSchema.parse({
        kind: "person",
        name: "Jane Doe",
      })
    ).toEqual({
      kind: "person",
      name: "Jane Doe",
      slug: "jane-doe",
    });
  });

  it("normalizes an explicit slug", () => {
    expect(
      createEntityFieldsSchema.parse({
        kind: "org",
        name: "Acme Corp",
        slug: "  Alpha Corp  ",
      })
    ).toEqual({
      kind: "org",
      name: "Acme Corp",
      slug: "alpha-corp",
    });
  });
});

describe("createEntityInputSchema", () => {
  it("keeps case scope with normalized fields", () => {
    expect(
      createEntityInputSchema.parse({
        caseId: CASE_ID,
        kind: "person",
        name: "Jane Doe",
      })
    ).toEqual({
      caseId: CASE_ID,
      kind: "person",
      name: "Jane Doe",
      slug: "jane-doe",
    });
  });
});

describe("createEdgeFieldsSchema", () => {
  it("trims notes and normalizes evidence ids", () => {
    const evidenceId = testId(3);
    expect(
      createEdgeFieldsSchema.parse({
        fromId: `  ${FROM_ID}  `,
        toId: `  ${TO_ID}  `,
        predicate: "  owns  ",
        confidence: "  possible  ",
        notes: "  linked  ",
        evidenceIds: [`  ${evidenceId}  `],
      })
    ).toEqual({
      fromId: FROM_ID,
      toId: TO_ID,
      predicate: "owns",
      confidence: "possible",
      notes: "linked",
      evidenceIds: [evidenceId],
    });
  });

  it("rejects related_to without notes", () => {
    expect(
      createEdgeFieldsSchema.safeParse({
        fromId: FROM_ID,
        toId: TO_ID,
        predicate: "related_to",
        confidence: "unverified",
      }).success
    ).toBe(false);
  });
});

describe("createEdgeInputSchema", () => {
  it("includes case scope", () => {
    expect(
      createEdgeInputSchema.parse({
        caseId: CASE_ID,
        fromId: FROM_ID,
        toId: TO_ID,
        predicate: "owns",
        confidence: "unverified",
      })
    ).toMatchObject({
      caseId: CASE_ID,
      fromId: FROM_ID,
      toId: TO_ID,
    });
  });
});

describe("edgeUpdateFieldsSchema", () => {
  it("clears notes when an empty string is sent", () => {
    expect(
      edgeUpdateFieldsSchema.parse({
        notes: "",
      }).notes
    ).toBeNull();
  });
});

describe("updateEdgeInputSchema", () => {
  it("rejects viewEntityId-only edge updates", () => {
    expect(
      updateEdgeInputSchema.safeParse({
        caseId: CASE_ID,
        edgeId: testId(4),
        viewEntityId: FROM_ID,
      }).success
    ).toBe(false);
  });
});
