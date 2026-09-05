import { describe, expect, it } from "vitest";

import {
  claimSchema,
  createCaseInputSchema,
  credentialSlotSchema,
  graphWriteResultSchema,
} from "../schemas";

describe("api schemas", () => {
  it("derives case slug from name when omitted", () => {
    expect(createCaseInputSchema.parse({ name: "Alpha Case" })).toMatchObject({
      name: "Alpha Case",
      slug: "alpha-case",
    });
  });

  it("accepts wire shapes for claims and graph writes", () => {
    expect(
      claimSchema.parse({
        id: "00000000-0000-4000-8000-000000000010",
        entityId: "00000000-0000-4000-8000-000000000011",
        class: "observation",
        text: "Observed handle",
        confidence: "unverified",
        retracted: false,
        retractKind: null,
        retractedReason: null,
        retractedBy: null,
        retractedAt: null,
        evidenceIds: [],
      })
    ).toBeDefined();

    expect(
      graphWriteResultSchema.parse({
        writeId: "00000000-0000-4000-8000-000000000099",
        confidence: "unverified",
        opCount: 1,
        replayed: false,
        actorLabel: "analyst",
      })
    ).toBeDefined();
  });

  it("accepts credential slot metadata without secrets", () => {
    expect(
      credentialSlotSchema.parse({
        name: "AI_COMPAT_API_KEY",
        label: "AI",
        description: "Compat key",
        configured: true,
        updatedAt: null,
      })
    ).toBeDefined();
  });
});
