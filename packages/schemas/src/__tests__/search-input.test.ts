import { describe, expect, it } from "vitest";

import { SEARCH_MIN_QUERY_LENGTH, searchCaseInputSchema } from "../search";

describe("searchCaseInputSchema", () => {
  const caseId = "550e8400-e29b-41d4-a716-446655440000";

  it("trims and enforces the shared minimum query length", () => {
    expect(
      searchCaseInputSchema.parse({
        caseId,
        q: "  ab  ",
      })
    ).toEqual({
      caseId,
      q: "ab",
    });
    expect(SEARCH_MIN_QUERY_LENGTH).toBe(2);
  });

  it("rejects queries shorter than the minimum after trim", () => {
    expect(() =>
      searchCaseInputSchema.parse({
        caseId,
        q: " a ",
      })
    ).toThrow();
  });

  it("trims padded case ids", () => {
    expect(
      searchCaseInputSchema.parse({
        caseId: `  ${caseId}  `,
        q: "ab",
      })
    ).toEqual({ caseId, q: "ab" });
  });
});
