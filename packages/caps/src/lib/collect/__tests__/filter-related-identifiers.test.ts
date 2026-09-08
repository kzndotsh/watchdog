import { describe, expect, it } from "vitest";

import { filterRelatedIdentifiers } from "../filter-related-identifiers.ts";

describe("filterRelatedIdentifiers", () => {
  it("drops equivalent IPv6 spellings of the seed", () => {
    expect(
      filterRelatedIdentifiers("ip", "2001:db8::1", [
        "2001:0db8:0000:0000:0000:0000:0000:0001",
        "8.8.8.8",
      ])
    ).toEqual(["8.8.8.8"]);
  });

  it("drops case-folded domain seeds", () => {
    expect(
      filterRelatedIdentifiers("domain", "Example.COM", [
        "example.com",
        "api.example.com",
      ])
    ).toEqual(["api.example.com"]);
  });
});
