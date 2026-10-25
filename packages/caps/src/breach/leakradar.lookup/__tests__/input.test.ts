import { describe, expect, it } from "vitest";

import { leakradarLookupInput } from "../input";

describe("leakradar.lookup input", () => {
  it("defaults to one page of 25 and no domain listing", () => {
    expect(leakradarLookupInput.parse({ query: "alice@example.com" })).toEqual({
      query: "alice@example.com",
      pageSize: 25,
      page: 1,
      includeRecords: false,
    });
  });

  it("takes an email, a domain or a username through the breach seed parser", () => {
    for (const query of ["alice@example.com", "example.com", "alice_99"]) {
      expect(leakradarLookupInput.parse({ query }).query).toBe(query);
    }
  });

  it("bounds the page size and page", () => {
    for (const bad of [
      { pageSize: 0 },
      { pageSize: 101 },
      { page: 0 },
      { page: 11 },
      { pageSize: 1.5 },
    ]) {
      expect(() =>
        leakradarLookupInput.parse({ query: "example.com", ...bad })
      ).toThrow();
    }
  });

  it("accepts an explicit kind and rejects an unknown one", () => {
    expect(
      leakradarLookupInput.parse({ query: "alice", kind: "username" }).kind
    ).toBe("username");
    expect(() =>
      leakradarLookupInput.parse({ query: "alice", kind: "ip" })
    ).toThrow();
  });

  it("rejects an invalid query seed", () => {
    expect(() => leakradarLookupInput.parse({ query: "foo bar" })).toThrow();
  });
});
