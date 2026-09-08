import { describe, expect, it } from "vitest";

import { eligibleCtDomains, withSeedHost } from "../eligible-domain-hosts.ts";

describe("eligibleCtDomains", () => {
  it("drops wildcards and dedupes hosts", () => {
    expect(
      eligibleCtDomains([
        "*.example.com",
        "www.example.com",
        "api.*.example.com",
        "WWW.example.com",
      ])
    ).toEqual(["www.example.com"]);
  });
});

describe("withSeedHost", () => {
  it("prepends the queried host and dedupes", () => {
    expect(withSeedHost("example.com", ["www.example.com"])).toEqual([
      "example.com",
      "www.example.com",
    ]);
    expect(
      withSeedHost("Example.com", ["example.com", "www.example.com"])
    ).toEqual(["example.com", "www.example.com"]);
  });
});
