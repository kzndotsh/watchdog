import { describe, expect, it } from "vitest";

import { buildUpdateEntityFieldsData } from "@/domains/entities/lib/entity-write";
import { testId } from "@watchdog/test-kit";

describe("buildUpdateEntityFieldsData", () => {
  it("trims entity name and clears blank summary", () => {
    const caseId = testId(10);
    const entityId = testId(11);
    const parsed = buildUpdateEntityFieldsData(caseId, {
      entityId,
      name: "  Jane Doe  ",
      summary: "   ",
    });
    expect(parsed).toEqual({
      caseId,
      entityId,
      name: "Jane Doe",
      summary: null,
    });
  });

  it("trims padded entity id", () => {
    const caseId = testId(10);
    const entityId = testId(12);
    const parsed = buildUpdateEntityFieldsData(caseId, {
      entityId: `  ${entityId}  `,
      notes: "working notes",
    });
    expect(parsed.entityId).toBe(entityId);
    expect(parsed.notes).toBe("working notes");
  });
});
