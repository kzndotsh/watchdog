import { describe, expect, it, vi } from "vitest";

import {
  isHandleWithoutPlatform,
  tryCommitIdentifierPlatform,
  tryCommitIdentifierType,
  tryCommitIdentifierValue,
} from "../commit-identifier-field.ts";
import { connectionComposerIssues } from "../connection-composer.ts";
import { buildCreateEdgeData, buildUpdateEdgeData } from "../edge-write.ts";
import { pasteEntityErrorLabel } from "../paste-entity-error-label.ts";

vi.mock("@/shared/ui/shadcn/toast", () => ({
  toast: { error: vi.fn() },
}));

describe("pasteEntityErrorLabel", () => {
  it("aliases Ambiguous entity", () => {
    expect(pasteEntityErrorLabel("Ambiguous entity")).toBe("Ambiguous");
    expect(pasteEntityErrorLabel("Entity is ambiguous")).toBe("Ambiguous");
    expect(pasteEntityErrorLabel("Entity not found")).toBe("Not found");
  });
});

describe("commit-identifier-field", () => {
  it("blocks handle without platform", () => {
    expect(isHandleWithoutPlatform("handle", "")).toBe(true);
    expect(isHandleWithoutPlatform("email", "")).toBe(false);
    expect(tryCommitIdentifierPlatform("handle", "@ada", "")).toBe(false);
  });

  it("normalizes an email value", () => {
    expect(tryCommitIdentifierValue("email", "Ada@MailHost.test", "")).toBe(
      "ada@mailhost.test"
    );
  });

  it("commits a type change and re-normalizes the value", () => {
    expect(tryCommitIdentifierType("email", "Ada@MailHost.test", "")).toEqual({
      type: "email",
      value: "ada@mailhost.test",
    });
    expect(tryCommitIdentifierType("handle", "ada", "")).toBe(false);
  });
});

describe("connection composer + edge write", () => {
  it("requires notes for related_to", () => {
    expect(
      connectionComposerIssues({
        peerId: "p",
        phraseValue: "related_to:forward",
        notes: "",
      })
    ).toMatch(/related_to/);
  });

  it("defaults table creates to unverified without evidence", () => {
    const created = buildCreateEdgeData({
      caseId: "11111111-1111-4111-8111-000000000010",
      centerId: "11111111-1111-4111-8111-000000000020",
      core: {
        peerId: "11111111-1111-4111-8111-000000000021",
        predicate: "owns",
        orientation: "forward",
      },
    });
    expect(created.confidence).toBe("unverified");
    expect(created.evidenceIds).toBeUndefined();
  });

  it("builds an update payload with the edge id", () => {
    const updated = buildUpdateEdgeData({
      caseId: "11111111-1111-4111-8111-000000000010",
      centerId: "11111111-1111-4111-8111-000000000020",
      edgeId: "11111111-1111-4111-8111-000000000036",
      existing: {
        fromId: "11111111-1111-4111-8111-000000000020",
        toId: "11111111-1111-4111-8111-000000000021",
        peerId: "11111111-1111-4111-8111-000000000021",
      },
      core: {
        peerId: "11111111-1111-4111-8111-000000000021",
        predicate: "owns",
        orientation: "forward",
      },
      confidence: "possible",
    });
    expect(updated.edgeId).toBe("11111111-1111-4111-8111-000000000036");
    expect(updated.confidence).toBe("possible");
    expect(updated.predicate).toBe("owns");
    expect(updated.notes).toBeUndefined();
  });

  it("clears notes when core.notes is blank", () => {
    const updated = buildUpdateEdgeData({
      caseId: "11111111-1111-4111-8111-000000000010",
      centerId: "11111111-1111-4111-8111-000000000020",
      edgeId: "11111111-1111-4111-8111-000000000036",
      existing: {
        fromId: "11111111-1111-4111-8111-000000000020",
        toId: "11111111-1111-4111-8111-000000000021",
        peerId: "11111111-1111-4111-8111-000000000021",
      },
      core: {
        peerId: "11111111-1111-4111-8111-000000000021",
        predicate: "owns",
        orientation: "forward",
        notes: "  ",
      },
    });
    expect(updated.notes).toBeNull();
  });

  it("includes an empty evidenceIds array to clear attachments", () => {
    const updated = buildUpdateEdgeData({
      caseId: "11111111-1111-4111-8111-000000000010",
      centerId: "11111111-1111-4111-8111-000000000020",
      edgeId: "11111111-1111-4111-8111-000000000036",
      existing: {
        fromId: "11111111-1111-4111-8111-000000000020",
        toId: "11111111-1111-4111-8111-000000000021",
        peerId: "11111111-1111-4111-8111-000000000021",
      },
      core: {
        peerId: "11111111-1111-4111-8111-000000000021",
        predicate: "owns",
        orientation: "forward",
      },
      evidenceIds: [],
    });
    expect(updated.evidenceIds).toEqual([]);
  });

  it("normalizes padded evidenceIds on create", () => {
    const evidenceId = "11111111-1111-4111-8111-000000000099";
    const created = buildCreateEdgeData({
      caseId: "11111111-1111-4111-8111-000000000010",
      centerId: "11111111-1111-4111-8111-000000000020",
      core: {
        peerId: "11111111-1111-4111-8111-000000000021",
        predicate: "owns",
        orientation: "forward",
      },
      evidenceIds: [`  ${evidenceId}  `, "  "],
    });
    expect(created.evidenceIds).toEqual([evidenceId]);
  });

  it("rejects invalid evidenceIds on create", () => {
    expect(() =>
      buildCreateEdgeData({
        caseId: "11111111-1111-4111-8111-000000000010",
        centerId: "11111111-1111-4111-8111-000000000020",
        core: {
          peerId: "11111111-1111-4111-8111-000000000021",
          predicate: "owns",
          orientation: "forward",
        },
        evidenceIds: ["not-a-uuid"],
      })
    ).toThrow();
  });
});
