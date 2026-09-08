import { describe, it, expect } from "vitest";

import { draftToOutcome, draftToPatchOps } from "../draft-to-patch-ops.ts";

describe("draft-to-patch-ops", () => {
  const entityId = "11111111-1111-4111-8111-111111111111";
  const evidenceId = "22222222-2222-4222-8222-222222222222";
  const emptyDraft = {
    summary: undefined,
    claims: [],
    questions: [],
  };

  it("draftToPatchOps maps platform and status onto identifier create", () => {
    const patch = draftToPatchOps(
      {
        ...emptyDraft,
        identifiers: [
          {
            type: "handle",
            value: "@alice",
            platform: "discord",
            status: "former",
            notes: "bio",
            evidenceQuote: "discord: @alice (left 2024)",
          },
        ],
      },
      { evidenceId, entityId }
    );
    expect(patch.length).toBe(1);
    const op = patch[0];
    expect(op.resource).toBe("identifier");
    expect(op.data.type).toBe("handle");
    expect(op.data.value).toBe("@alice");
    expect(op.data.platform).toBe("discord");
    expect(op.data.status).toBe("former");
    expect(typeof op.data.notes === "string").toBeTruthy();
    expect(op.data.notes).toMatch(/bio/);
    expect(op.data.notes).toMatch(/quote:/);
  });

  it("draftToPatchOps defaults platform to empty string when omitted", () => {
    const patch = draftToPatchOps(
      {
        ...emptyDraft,
        identifiers: [{ type: "email", value: "a@b.co" }],
      },
      { evidenceId, entityId }
    );
    expect(patch[0].data.platform).toBe("");
    expect(patch[0].data.status).toBe(undefined);
  });

  it("draftToPatchOps normalizes platform aliases and keeps customs", () => {
    const aliasPatch = draftToPatchOps(
      {
        ...emptyDraft,
        identifiers: [{ type: "handle", value: "@a", platform: "X" }],
      },
      { evidenceId, entityId }
    );
    expect(aliasPatch[0].data.platform).toBe("twitter");

    const customPatch = draftToPatchOps(
      {
        ...emptyDraft,
        identifiers: [{ type: "handle", value: "@b", platform: "Boy Moment" }],
      },
      { evidenceId, entityId }
    );
    expect(customPatch[0].data.platform).toBe("boy_moment");
  });

  it("draftToPatchOps skips handles without a platform", () => {
    const patch = draftToPatchOps(
      {
        ...emptyDraft,
        identifiers: [
          { type: "handle", value: "@alice" },
          { type: "email", value: "a@b.co" },
        ],
      },
      { evidenceId, entityId }
    );
    expect(patch).toHaveLength(1);
    expect(patch[0].resource).toBe("identifier");
    expect(patch[0].data.type).toBe("email");
  });

  it("draftToPatchOps trims padded entity and evidence ids", () => {
    const patch = draftToPatchOps(
      {
        ...emptyDraft,
        identifiers: [{ type: "email", value: "a@b.co" }],
      },
      { evidenceId: `  ${evidenceId}  `, entityId: `  ${entityId}  ` }
    );
    expect(patch).toHaveLength(1);
    expect(patch[0].data.entityId).toBe(entityId);
    expect(patch[0].evidenceIds).toEqual([evidenceId]);
  });

  it("draftToPatchOps skips wildcard domain identifiers", () => {
    const patch = draftToPatchOps(
      {
        ...emptyDraft,
        identifiers: [
          { type: "domain", value: "*.example.com" },
          { type: "domain", value: "example.com" },
        ],
      },
      { evidenceId, entityId }
    );
    expect(patch).toHaveLength(1);
    expect(patch[0].data.type).toBe("domain");
    expect(patch[0].data.value).toBe("example.com");
  });

  it("draftToPatchOps ignores whitespace-only notes and evidence quotes", () => {
    const patch = draftToPatchOps(
      {
        ...emptyDraft,
        claims: [
          {
            text: "observed activity",
            evidenceQuote: "   ",
          },
        ],
        identifiers: [
          {
            type: "email",
            value: "a@b.co",
            notes: "  ",
            evidenceQuote: " ",
          },
        ],
      },
      { evidenceId, entityId }
    );
    expect(patch).toHaveLength(2);
    expect(patch[0].data.notes).toBeUndefined();
    expect(patch[1].data.text).toBe("observed activity");
  });

  it("draftToPatchOps skips whitespace-only claims and questions", () => {
    const patch = draftToPatchOps(
      {
        ...emptyDraft,
        claims: [{ text: "   " }],
        questions: [{ text: "\n\t" }],
        identifiers: [{ type: "email", value: "a@b.co" }],
      },
      { evidenceId, entityId }
    );
    expect(patch).toHaveLength(1);
    expect(patch[0].resource).toBe("identifier");
  });

  it("draftToPatchOps throws when entityId is present but invalid", () => {
    expect(() =>
      draftToPatchOps(
        {
          ...emptyDraft,
          identifiers: [{ type: "email", value: "a@b.co" }],
        },
        { evidenceId, entityId: "not-a-uuid" }
      )
    ).toThrow("Entity id is not a valid UUID");
  });

  it("draftToOutcome returns failed for invalid entityId", () => {
    expect(
      draftToOutcome(
        {
          ...emptyDraft,
          identifiers: [{ type: "email", value: "a@b.co" }],
        },
        { evidenceId, entityId: "not-a-uuid" }
      )
    ).toEqual({
      kind: "failed",
      error: "Entity id is not a valid UUID",
    });
  });

  it("draftToOutcome returns failed for invalid evidenceId", () => {
    expect(
      draftToOutcome(
        {
          ...emptyDraft,
          identifiers: [{ type: "email", value: "a@b.co" }],
        },
        { evidenceId: "bad", entityId }
      )
    ).toEqual({
      kind: "failed",
      error: "Evidence id is not a valid UUID",
    });
  });
});
