import { describe, expect, it } from "vitest";

import { validatedIdentifierValue } from "../validated-identifier-value.ts";

describe("validatedIdentifierValue", () => {
  it("rejects wildcard domains", () => {
    expect(validatedIdentifierValue("domain", "*.example.com")).toBeNull();
    expect(validatedIdentifierValue("domain", "example.com")).toBe(
      "example.com"
    );
  });

  it("rejects invalid emails and urls", () => {
    expect(validatedIdentifierValue("email", "not-an-email")).toBeNull();
    expect(validatedIdentifierValue("url", "ftp://example.com")).toBeNull();
    expect(validatedIdentifierValue("email", "ada@example.com")).toBe(
      "ada@example.com"
    );
  });
});
