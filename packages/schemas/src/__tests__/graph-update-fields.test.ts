import { describe, expect, it } from "vitest";

import { claimUpdateFieldsSchema } from "../claim-update";
import { entityUpdateFieldsSchema } from "../entity-update";
import { eventUpdateFieldsSchema } from "../event-update";
import { questionUpdateFieldsSchema } from "../question-update";

describe("claimUpdateFieldsSchema", () => {
  it("trims text and enum fields", () => {
    expect(
      claimUpdateFieldsSchema.parse({
        text: "  updated claim  ",
        class: "  assessment  ",
        confidence: "  possible  ",
      })
    ).toEqual({
      text: "updated claim",
      class: "assessment",
      confidence: "possible",
    });
  });

  it("rejects whitespace-only text", () => {
    expect(claimUpdateFieldsSchema.safeParse({ text: "   " }).success).toBe(
      false
    );
  });
});

describe("eventUpdateFieldsSchema", () => {
  it("trims when/what and clears blank where", () => {
    expect(
      eventUpdateFieldsSchema.parse({
        when: "  2024-01-02  ",
        what: "  follow-up  ",
        where: "   ",
      })
    ).toEqual({
      when: "2024-01-02",
      what: "follow-up",
      where: null,
    });
  });
});

describe("questionUpdateFieldsSchema", () => {
  it("trims text and clears blank resolved notes", () => {
    expect(
      questionUpdateFieldsSchema.parse({
        text: "  revised question?  ",
        resolvedNote: "   ",
      })
    ).toEqual({
      text: "revised question?",
      resolvedNote: null,
    });
  });
});

describe("entityUpdateFieldsSchema", () => {
  it("trims name and clears blank summary/notes", () => {
    expect(
      entityUpdateFieldsSchema.parse({
        name: "  Ada Lovelace  ",
        summary: "   ",
        notes: "  note  ",
      })
    ).toEqual({
      name: "Ada Lovelace",
      summary: null,
      notes: "note",
    });
  });

  it("normalizes padded evidence-free kind changes", () => {
    expect(
      entityUpdateFieldsSchema.parse({
        kind: "  person  ",
      })
    ).toEqual({
      kind: "person",
    });
  });
});
