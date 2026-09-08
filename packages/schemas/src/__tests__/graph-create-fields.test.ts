import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { createClaimFieldsSchema } from "../claim-create";
import { createEventFieldsSchema } from "../event-create";
import { createQuestionFieldsSchema } from "../question-create";

describe("createClaimFieldsSchema", () => {
  it("trims text and enum fields and defaults class", () => {
    expect(
      createClaimFieldsSchema.parse({
        text: "  observed activity  ",
        confidence: "  possible  ",
        class: "  assessment  ",
      })
    ).toEqual({
      text: "observed activity",
      confidence: "possible",
      class: "assessment",
    });
  });

  it("normalizes padded evidence ids", () => {
    const evidenceId = testId(1);
    expect(
      createClaimFieldsSchema.parse({
        text: "note",
        confidence: "unverified",
        evidenceIds: [`  ${evidenceId}  `],
      }).evidenceIds
    ).toEqual([evidenceId]);
  });
});

describe("createEventFieldsSchema", () => {
  it("trims when/what/where", () => {
    expect(
      createEventFieldsSchema.parse({
        when: "  2024-01-01  ",
        what: "  met source  ",
        where: "  Berlin  ",
      })
    ).toEqual({
      when: "2024-01-01",
      what: "met source",
      where: "Berlin",
    });
  });

  it("rejects whitespace-only what", () => {
    expect(
      createEventFieldsSchema.safeParse({
        when: "2024",
        what: "   ",
      }).success
    ).toBe(false);
  });
});

describe("createQuestionFieldsSchema", () => {
  it("trims question text", () => {
    expect(
      createQuestionFieldsSchema.parse({
        text: "  who owns this domain?  ",
      })
    ).toEqual({
      text: "who owns this domain?",
    });
  });
});
