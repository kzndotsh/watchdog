import { describe, it, expect } from "vitest";

import { interpretProcessDraft } from "../process-shared.ts";

describe("interpret-process", () => {
  const entityId = "11111111-1111-4111-8111-111111111111";
  const evidenceId = "22222222-2222-4222-8222-222222222222";

  const empty = {
    noEntity: "no entity",
    empty: "nothing found",
  };

  it("interpretProcessDraft maps draft identifiers to Proposal patch", () => {
    const result = interpretProcessDraft(
      {
        identifiers: [{ type: "email", value: "a@b.co" }],
        claims: [],
        questions: [],
      },
      { input: { evidenceId, entityId } },
      empty
    );
    expect(result.markSourceProcessed).toBe(true);
    expect(result.patch.length >= 1).toBeTruthy();
    expect(result.patch[0].resource).toBe("identifier");
    expect(result.patch[0].data.value).toBe("a@b.co");
  });

  it("interpretProcessDraft uses snapshotEntityId when input omits entity", () => {
    const result = interpretProcessDraft(
      {
        identifiers: [{ type: "email", value: "a@b.co" }],
        claims: [],
        questions: [],
      },
      {
        input: { evidenceId },
        snapshotEntityId: `  ${entityId}  `,
      },
      empty
    );
    expect(result.patch[0].data.entityId).toBe(entityId);
    expect(result.markSourceProcessed).toBe(true);
  });

  it("interpretProcessDraft keeps Process open when signal but no entity", () => {
    const result = interpretProcessDraft(
      {
        identifiers: [{ type: "email", value: "a@b.co" }],
        claims: [],
        questions: [],
      },
      { input: { evidenceId }, snapshotTextChars: 100 },
      empty
    );
    expect(result.patch).toEqual([]);
    expect(result.summary).toBe(empty.noEntity);
    expect(result.markSourceProcessed).toBe(false);
  });

  it("interpretProcessDraft does not mark empty URL dump processed", () => {
    const result = interpretProcessDraft(
      { identifiers: [], claims: [], questions: [] },
      { input: { evidenceId, entityId }, snapshotTextChars: 0 },
      empty
    );
    expect(result.patch).toEqual([]);
    expect(result.summary).toBe(empty.empty);
    expect(result.markSourceProcessed).toBe(false);
  });

  it("interpretProcessDraft marks empty harvest done when text existed", () => {
    const result = interpretProcessDraft(
      { identifiers: [], claims: [], questions: [] },
      { input: { evidenceId, entityId }, snapshotTextChars: 40 },
      empty
    );
    expect(result.markSourceProcessed).toBe(true);
  });

  it("interpretProcessDraft surfaces summary-only drafts without patch ops", () => {
    const result = interpretProcessDraft(
      {
        summary: "  No structured identifiers; narrative only.  ",
        identifiers: [],
        claims: [],
        questions: [],
      },
      { input: { evidenceId, entityId }, snapshotTextChars: 40 },
      empty
    );
    expect(result.patch).toEqual([]);
    expect(result.summary).toBe("No structured identifiers; narrative only.");
    expect(result.markSourceProcessed).toBe(true);
  });

  it("interpretProcessDraft skips handles without a platform", () => {
    const result = interpretProcessDraft(
      {
        identifiers: [
          { type: "handle", value: "@alice" },
          { type: "email", value: "a@b.co" },
        ],
        claims: [],
        questions: [],
      },
      { input: { evidenceId, entityId } },
      empty
    );
    expect(
      result.patch.filter((op) => op.resource === "identifier")
    ).toHaveLength(1);
    expect(result.patch[0].data.type).toBe("email");
  });

  it("interpretProcessDraft rejects invalid entityId", () => {
    expect(() =>
      interpretProcessDraft(
        {
          identifiers: [{ type: "email", value: "a@b.co" }],
          claims: [],
          questions: [],
        },
        { input: { evidenceId, entityId: "not-a-uuid" } },
        empty
      )
    ).toThrow(/valid entityId/);
  });

  it("interpretProcessDraft rejects invalid evidenceId", () => {
    expect(() =>
      interpretProcessDraft(
        {
          identifiers: [{ type: "email", value: "a@b.co" }],
          claims: [],
          questions: [],
        },
        { input: { evidenceId: "bad", entityId } },
        empty
      )
    ).toThrow(/valid evidenceId/);
  });
});
