import { describe, expect, it } from "vitest";

import { edgeRelatedToHasNotes } from "@watchdog/schemas";

import { withoutUserOverride } from "../graph-input";

describe("edgeRelatedToHasNotes", () => {
  it("requires notes when predicate is related_to", () => {
    expect(edgeRelatedToHasNotes({ predicate: "related_to" })).toBe(false);
    expect(
      edgeRelatedToHasNotes({ predicate: "related_to", notes: "  " })
    ).toBe(false);
    expect(
      edgeRelatedToHasNotes({ predicate: "related_to", notes: "linked" })
    ).toBe(true);
  });

  it("allows other predicates without notes", () => {
    expect(edgeRelatedToHasNotes({ predicate: "same_as" })).toBe(true);
  });
});

describe("withoutUserOverride", () => {
  it("removes userOverride from graph child payloads", () => {
    expect(
      withoutUserOverride({
        caseId: "00000000-0000-4000-8000-000000000001",
        text: "note",
        userOverride: true,
      })
    ).toEqual({
      caseId: "00000000-0000-4000-8000-000000000001",
      text: "note",
    });
  });
});
