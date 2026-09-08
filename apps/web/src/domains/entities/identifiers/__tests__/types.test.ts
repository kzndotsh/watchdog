import { describe, expect, it } from "vitest";

import {
  createIdentifierInputSchema,
  updateIdentifierInputSchema,
} from "@/domains/entities/identifiers/types";
import { testId } from "@watchdog/test-kit";

describe("identifiers types schemas", () => {
  it("defaults status to unknown and trims optional fields", () => {
    const parsed = createIdentifierInputSchema.parse({
      caseId: testId(10),
      entityId: testId(20),
      type: "email",
      value: " user@example.com ",
      confidence: "possible",
      platform: "  ",
      notes: " work ",
    });

    expect(parsed.status).toBe("unknown");
    expect(parsed.value).toBe("user@example.com");
    expect(parsed.notes).toBe("work");
    expect(parsed.platform).toBeUndefined();
  });

  it("trims padded entity and evidence ids", () => {
    const entityId = testId(21);
    const evidenceId = testId(22);
    const parsed = createIdentifierInputSchema.parse({
      caseId: testId(10),
      entityId: `  ${entityId}  `,
      type: "email",
      value: "user@example.com",
      confidence: "possible",
      evidenceIds: [`  ${evidenceId}  `],
    });
    expect(parsed.entityId).toBe(entityId);
    expect(parsed.evidenceIds).toEqual([evidenceId]);
  });

  it("rejects empty identifier update input", () => {
    expect(
      updateIdentifierInputSchema.safeParse({
        caseId: testId(10),
        identifierId: testId(11),
      }).success
    ).toBe(false);
  });

  it("clears notes when an empty string is sent", () => {
    expect(
      updateIdentifierInputSchema.parse({
        caseId: testId(10),
        identifierId: testId(11),
        notes: "",
      }).notes
    ).toBeNull();
  });
});
