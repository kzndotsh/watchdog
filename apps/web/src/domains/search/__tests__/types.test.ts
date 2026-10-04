import { describe, expect, it } from "vitest";

import {
  SEARCH_MIN_QUERY_LENGTH,
  searchCaseInputSchema,
} from "@watchdog/schemas/cases";

describe("search types", () => {
  it("re-exports the shared search minimum query length", () => {
    expect(SEARCH_MIN_QUERY_LENGTH).toBe(2);
  });

  it("validates search case input with the shared schema", () => {
    expect(
      searchCaseInputSchema.parse({
        caseId: "550e8400-e29b-41d4-a716-446655440000",
        q: "alpha",
      })
    ).toEqual({
      caseId: "550e8400-e29b-41d4-a716-446655440000",
      q: "alpha",
    });
  });
});
