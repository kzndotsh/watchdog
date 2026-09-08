import { describe, expect, it } from "vitest";

import {
  domainValuesBatch,
  eligibleDomainCount,
  eligibleEmailCount,
  eligibleHandoffHosts,
  eligibleIpCount,
  eligibleUrlCount,
  emailValuesBatch,
  hashSeedBatch,
  identifierTruncationNote,
  ipSeedBatch,
  ipValuesBatch,
  querySeedBatches,
  urlSeedBatch,
  urlValuesBatch,
} from "../query-seed-batches.ts";

describe("querySeedBatches", () => {
  it("returns ip, domain, url, and email batches for valid seeds", () => {
    expect(querySeedBatches("1.2.3.4", "ip")).toEqual([
      { type: "ip", values: ["1.2.3.4"] },
    ]);
    expect(querySeedBatches("example.com", "domain")).toEqual([
      { type: "domain", values: ["example.com"] },
    ]);
    expect(querySeedBatches("https://example.com/", "url")).toEqual([
      { type: "url", values: ["https://example.com"] },
    ]);
    expect(querySeedBatches("alice@example.com", "email")).toEqual([
      { type: "email", values: ["alice@example.com"] },
    ]);
  });

  it("maps hash seeds to other Identifiers", () => {
    expect(
      querySeedBatches("44d88612fea8a8f36de82e1278abb02f", "hash")
    ).toEqual([
      {
        type: "other",
        values: ["44d88612fea8a8f36de82e1278abb02f"],
      },
    ]);
  });

  it("normalizes email seeds via validatedIdentifierValue", () => {
    expect(querySeedBatches("Alice@Example.COM", "email")).toEqual([
      { type: "email", values: ["alice@example.com"] },
    ]);
  });

  it("skips other kinds", () => {
    expect(querySeedBatches("foo", "other")).toEqual([]);
  });
});

describe("hashSeedBatch", () => {
  it("wraps the queried hash", () => {
    expect(hashSeedBatch("abc")).toEqual([{ type: "other", values: ["abc"] }]);
  });

  it("skips invalid hash values", () => {
    expect(hashSeedBatch("   ")).toEqual([]);
  });
});

describe("ipSeedBatch", () => {
  it("wraps the queried IP", () => {
    expect(ipSeedBatch("203.0.113.1")).toEqual([
      { type: "ip", values: ["203.0.113.1"] },
    ]);
  });

  it("skips invalid IP values", () => {
    expect(ipSeedBatch("not-an-ip")).toEqual([]);
  });
});

describe("ipValuesBatch", () => {
  it("dedupes and validates multiple IPs", () => {
    expect(ipValuesBatch(["1.2.3.4", "1.2.3.4", "5.6.7.8"])).toEqual([
      { type: "ip", values: ["1.2.3.4", "5.6.7.8"] },
    ]);
  });
});

describe("domainValuesBatch", () => {
  it("dedupes and validates multiple domains", () => {
    expect(
      domainValuesBatch(["example.com", "EXAMPLE.COM", "api.example.com"])
    ).toEqual([
      {
        type: "domain",
        values: ["example.com", "api.example.com"],
      },
    ]);
  });

  it("drops wildcard domains before validation", () => {
    expect(domainValuesBatch(["*.example.com", "dns.google"])).toEqual([
      { type: "domain", values: ["dns.google"] },
    ]);
  });
});

describe("emailValuesBatch", () => {
  it("dedupes and validates multiple emails", () => {
    expect(
      emailValuesBatch(["alice@example.com", "Alice@Example.COM"])
    ).toEqual([{ type: "email", values: ["alice@example.com"] }]);
  });
});

describe("urlSeedBatch", () => {
  it("wraps the queried URL", () => {
    expect(urlSeedBatch("https://example.com/path")).toEqual([
      { type: "url", values: ["https://example.com/path"] },
    ]);
  });
});

describe("urlValuesBatch", () => {
  it("dedupes and validates multiple URLs", () => {
    expect(
      urlValuesBatch([
        "https://example.com/",
        "https://example.com/",
        "https://api.example.com/",
      ])
    ).toEqual([
      {
        type: "url",
        values: ["https://example.com", "https://api.example.com"],
      },
    ]);
  });
});

describe("eligibleDomainCount", () => {
  it("counts only eligible domains", () => {
    expect(eligibleDomainCount(["*.example.com", "dns.google"])).toBe(1);
    expect(eligibleDomainCount(["example.com", "EXAMPLE.COM"])).toBe(1);
  });
});

describe("eligibleIpCount", () => {
  it("counts only eligible IPs", () => {
    expect(eligibleIpCount(["8.8.8.8", "999.1.1.1"])).toBe(1);
  });
});

describe("eligibleHandoffHosts", () => {
  it("matches domainValuesBatch after withSeedHost", () => {
    expect(
      eligibleHandoffHosts("example.com", ["*.example.com", "www.example.com"])
    ).toEqual(["example.com", "www.example.com"]);
    expect(
      eligibleHandoffHosts("example.com", ["nodot", "www.example.com"])
    ).toEqual(["example.com", "www.example.com"]);
  });
});

describe("eligibleUrlCount", () => {
  it("counts deduped valid URLs", () => {
    expect(
      eligibleUrlCount(["https://example.com/", "https://example.com/"])
    ).toBe(1);
  });
});

describe("eligibleEmailCount", () => {
  it("counts deduped valid emails", () => {
    expect(eligibleEmailCount(["alice@example.com", "Alice@Example.COM"])).toBe(
      1
    );
  });
});

describe("identifierTruncationNote", () => {
  it("notes when proposed identifiers are capped", () => {
    expect(identifierTruncationNote(120, 80)).toBe(
      " (showing 80 of 120 in Identifiers)"
    );
    expect(identifierTruncationNote(10, 80)).toBe("");
  });
});
