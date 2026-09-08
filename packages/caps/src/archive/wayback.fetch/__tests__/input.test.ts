import { describe, expect, it } from "vitest";

import { waybackFetchInput } from "../input";

describe("wayback.fetch input", () => {
  it("requires a url and accepts optional timestamp and entityId", () => {
    expect(
      waybackFetchInput.parse({
        url: "https://example.com/page",
        timestamp: "20240101000000",
        entityId: "00000000-0000-4000-8000-000000000001",
      })
    ).toMatchObject({ url: "https://example.com/page" });
  });

  it("trims padded url", () => {
    expect(
      waybackFetchInput.parse({
        url: "  https://example.com/page  ",
      }).url
    ).toBe("https://example.com/page");
  });

  it("trims padded timestamp and clears whitespace-only", () => {
    expect(
      waybackFetchInput.parse({
        url: "https://example.com/page",
        timestamp: "  20240101000000  ",
      }).timestamp
    ).toBe("20240101000000");
    expect(
      waybackFetchInput.parse({
        url: "https://example.com/page",
        timestamp: "   ",
      }).timestamp
    ).toBeUndefined();
  });
});
