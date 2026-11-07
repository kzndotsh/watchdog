import { describe, expect, it } from "vitest";

import { isTextMime } from "@/shared/lib/text-mime";

describe("isTextMime", () => {
  it("matches common text and structured text mimes", () => {
    expect(isTextMime("text/plain")).toBe(true);
    expect(isTextMime("application/json")).toBe(true);
    expect(isTextMime("application/ld+json")).toBe(true);
    expect(isTextMime("application/xml")).toBe(true);
    expect(isTextMime("text/yaml")).toBe(true);
  });

  it("rejects binary and empty mimes", () => {
    expect(isTextMime("image/png")).toBe(false);
    expect(isTextMime(null)).toBe(false);
    expect(isTextMime("")).toBe(false);
  });
});
