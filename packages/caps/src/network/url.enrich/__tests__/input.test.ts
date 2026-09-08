import { describe, expect, it } from "vitest";

import { networkUrlEnrichInput } from "../input";

describe("networkUrlEnrichInput", () => {
  it("trims padded url", () => {
    expect(
      networkUrlEnrichInput.parse({
        url: "  https://example.com/page  ",
      }).url
    ).toBe("https://example.com/page");
  });
});
