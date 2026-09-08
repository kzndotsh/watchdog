import { describe, expect, it } from "vitest";

import {
  isEmptyDraft,
  processExtractDraftSchema,
} from "../process-extract-draft";

describe("processExtractDraftSchema", () => {
  it("fills empty arrays when parsing an empty object", () => {
    const parsed = processExtractDraftSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.identifiers).toEqual([]);
    expect(parsed.data.claims).toEqual([]);
    expect(parsed.data.questions).toEqual([]);
  });

  it("rejects an identifier with an empty value", () => {
    const parsed = processExtractDraftSchema.safeParse({
      identifiers: [{ type: "email", value: "" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("trims whitespace-only summary to undefined", () => {
    const parsed = processExtractDraftSchema.safeParse({
      summary: "   ",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.summary).toBeUndefined();
  });

  it("trims whitespace-only identifier notes and evidence quotes to undefined", () => {
    const parsed = processExtractDraftSchema.safeParse({
      identifiers: [
        {
          type: "email",
          value: "ada@example.com",
          notes: "   ",
          evidenceQuote: "\n",
        },
      ],
      claims: [{ text: "observed", evidenceQuote: "  " }],
      questions: [{ text: "who?", evidenceQuote: " " }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.identifiers[0]?.notes).toBeUndefined();
    expect(parsed.data.identifiers[0]?.evidenceQuote).toBeUndefined();
    expect(parsed.data.claims[0]?.evidenceQuote).toBeUndefined();
    expect(parsed.data.questions[0]?.evidenceQuote).toBeUndefined();
  });

  it("trims padded enum fields on draft items", () => {
    const parsed = processExtractDraftSchema.safeParse({
      identifiers: [
        {
          type: "  email  ",
          value: "ada@example.com",
          status: "  current  ",
        },
      ],
      claims: [{ text: "observed", class: "  observation  " }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.identifiers[0]?.type).toBe("email");
    expect(parsed.data.identifiers[0]?.status).toBe("current");
    expect(parsed.data.claims[0]?.class).toBe("observation");
  });

  it("strips extra confidence fields", () => {
    const parsed = processExtractDraftSchema.safeParse({
      identifiers: [
        {
          type: "email",
          value: "ada@example.com",
          confidence: "confirmed",
        },
      ],
      claims: [{ text: "observed", confidence: "confirmed" }],
      confidence: "confirmed",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).not.toHaveProperty("confidence");
    expect(parsed.data.identifiers[0]).not.toHaveProperty("confidence");
    expect(parsed.data.claims[0]).not.toHaveProperty("confidence");
  });
});

describe("isEmptyDraft", () => {
  it("returns true when every collection is empty", () => {
    expect(isEmptyDraft({ identifiers: [], claims: [], questions: [] })).toBe(
      true
    );
  });

  it("returns false when an identifier is present", () => {
    expect(
      isEmptyDraft({
        identifiers: [{ type: "email", value: "ada@example.com" }],
        claims: [],
        questions: [],
      })
    ).toBe(false);
  });
});
