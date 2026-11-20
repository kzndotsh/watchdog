import { describe, it, expect } from "vitest";

import { dataOf } from "../../../testing";
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
    expect(op.kind).toBe("identifier.create");
    expect(dataOf(op).type).toBe("handle");
    expect(dataOf(op).value).toBe("@alice");
    expect(dataOf(op).platform).toBe("discord");
    expect(dataOf(op).status).toBe("former");
    expect(typeof dataOf(op).notes === "string").toBeTruthy();
    expect(dataOf(op).notes).toMatch(/bio/);
    expect(dataOf(op).notes).toMatch(/quote:/);
  });

  it("draftToPatchOps defaults platform to empty string when omitted", () => {
    const patch = draftToPatchOps(
      {
        ...emptyDraft,
        identifiers: [{ type: "email", value: "a@b.co" }],
      },
      { evidenceId, entityId }
    );
    expect(dataOf(patch[0]).platform).toBe("");
    expect(dataOf(patch[0]).status).toBe(undefined);
  });

  it("draftToPatchOps normalizes platform aliases and keeps customs", () => {
    const aliasPatch = draftToPatchOps(
      {
        ...emptyDraft,
        identifiers: [{ type: "handle", value: "@a", platform: "X" }],
      },
      { evidenceId, entityId }
    );
    expect(dataOf(aliasPatch[0]).platform).toBe("twitter");

    const customPatch = draftToPatchOps(
      {
        ...emptyDraft,
        identifiers: [{ type: "handle", value: "@b", platform: "Boy Moment" }],
      },
      { evidenceId, entityId }
    );
    expect(dataOf(customPatch[0]).platform).toBe("boy_moment");
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
    expect(patch[0].kind).toBe("identifier.create");
    expect(dataOf(patch[0]).type).toBe("email");
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
    expect(dataOf(patch[0]).entityId).toBe(entityId);
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
    expect(dataOf(patch[0]).type).toBe("domain");
    expect(dataOf(patch[0]).value).toBe("example.com");
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
    expect(dataOf(patch[0]).notes).toBeUndefined();
    expect(dataOf(patch[1]).text).toBe("observed activity");
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
    expect(patch[0].kind).toBe("identifier.create");
  });

  it("draftToPatchOps returns [] when entityId is present but invalid", () => {
    expect(
      draftToPatchOps(
        {
          ...emptyDraft,
          identifiers: [{ type: "email", value: "a@b.co" }],
        },
        { evidenceId, entityId: "not-a-uuid" }
      )
    ).toEqual([]);
  });

  it("draftToPatchOps returns [] when evidenceId is invalid", () => {
    expect(
      draftToPatchOps(
        {
          ...emptyDraft,
          identifiers: [{ type: "email", value: "a@b.co" }],
        },
        { evidenceId: "bad", entityId }
      )
    ).toEqual([]);
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
