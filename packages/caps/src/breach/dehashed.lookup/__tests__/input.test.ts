import { describe, expect, it } from "vitest";

import { dehashedLookupInput } from "../input";

describe("dehashed.lookup input", () => {
  it("accepts a query and optional entity scope", () => {
    expect(
      dehashedLookupInput.parse({
        query: "alice@example.com",
        entityId: "00000000-0000-4000-8000-000000000001",
      })
    ).toMatchObject({ query: "alice@example.com" });
  });

  it("rejects invalid query seeds", () => {
    expect(() =>
      dehashedLookupInput.parse({ query: "not valid @ @" })
    ).toThrow();
  });
});
