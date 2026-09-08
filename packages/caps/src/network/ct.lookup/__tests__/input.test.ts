import { describe, expect, it } from "vitest";

import { ctLookupInput } from "../input";

describe("ct.lookup input", () => {
  it("requires host and accepts optional limit and entityId", () => {
    expect(
      ctLookupInput.parse({
        host: "example.com",
        limit: 25,
      })
    ).toMatchObject({ host: "example.com", limit: 25 });
  });

  it("trims padded optional entityId", () => {
    const id = "00000000-0000-4000-8000-000000000099";
    expect(
      ctLookupInput.parse({
        host: "example.com",
        entityId: `  ${id}  `,
      })
    ).toMatchObject({ entityId: id });
  });
});
