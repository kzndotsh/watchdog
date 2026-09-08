import { describe, expect, it } from "vitest";

import { urlscanSubmitInput } from "../input";

describe("urlscan.submit input", () => {
  it("requires url and defaults visibility to optional enum", () => {
    expect(
      urlscanSubmitInput.parse({
        url: "https://example.com/page",
        visibility: "unlisted",
      })
    ).toMatchObject({
      url: "https://example.com/page",
      visibility: "unlisted",
    });
  });

  it("trims padded visibility", () => {
    expect(
      urlscanSubmitInput.parse({
        url: "https://example.com/page",
        visibility: "  private  ",
      }).visibility
    ).toBe("private");
  });

  it("treats blank visibility as undefined", () => {
    expect(
      urlscanSubmitInput.parse({
        url: "https://example.com/page",
        visibility: "   ",
      }).visibility
    ).toBeUndefined();
  });

  it("case-folds padded visibility", () => {
    expect(
      urlscanSubmitInput.parse({
        url: "https://example.com/page",
        visibility: "  PRIVATE  ",
      }).visibility
    ).toBe("private");
  });
});
