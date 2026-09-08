import { describe, expect, it } from "vitest";

import { updateEdgeInputSchema } from "@/domains/entities/edges/types";
import { testId } from "@watchdog/test-kit";

describe("edge input schemas", () => {
  it("rejects empty edge update input", () => {
    expect(
      updateEdgeInputSchema.safeParse({
        caseId: testId(10),
        edgeId: testId(11),
      }).success
    ).toBe(false);
  });

  it("clears notes when an empty string is sent", () => {
    expect(
      updateEdgeInputSchema.parse({
        caseId: testId(10),
        edgeId: testId(11),
        notes: "",
      }).notes
    ).toBeNull();
  });
});
