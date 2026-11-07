import { describe, expect, it } from "vitest";

import { isTextMime } from "@/shared/lib/text-mime";

describe("isTextMime", () => {
  it("matches common text and structured text mimes", () => {
    expect(isTextMime("text/plain")).toBe(true);
    expect(isTextMime("application/json")).toBe(true);
    expect(isTextMime("application/ld+json")).toBe(true);
    expect(isTextMime("application/xml")).toBe(true);
    expect(isTextMime("text/yaml")).toBe(true);
    expect(isTextMime("text/html; charset=utf-8")).toBe(true);
    expect(isTextMime("application/xhtml+xml")).toBe(true);
    expect(isTextMime("image/svg+xml")).toBe(true);
    expect(isTextMime("application/x-yaml")).toBe(true);
    expect(isTextMime("application/javascript")).toBe(true);
  });

  it("rejects binary types whose names merely contain xml or html", () => {
    expect(
      isTextMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ).toBe(false);
    expect(
      isTextMime(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
    ).toBe(false);
    expect(isTextMime("application/vnd.ms-htmlhelp")).toBe(false);
  });

  it("rejects binary and empty mimes", () => {
    expect(isTextMime("image/png")).toBe(false);
    expect(isTextMime(null)).toBe(false);
    expect(isTextMime("")).toBe(false);
  });
});
