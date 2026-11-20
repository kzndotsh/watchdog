import { describe, expect, it } from "vitest";

import { ctLookup } from "../../../network/ct.lookup/cap";
import { dnsLookup } from "../../../network/dns.lookup/cap";
import { urlscanLookup } from "../../../network/urlscan.lookup/cap";
import { foundOfType } from "../found-values";

describe("foundOfType", () => {
  it("normalizes, validates and dedupes, keeping report order and no limit", () => {
    const raws = Array.from({ length: 300 }, (_, i) => `h${i}.acme.test`);
    const found = foundOfType(
      "domain",
      ["WWW.Acme.test", "www.acme.test", "", null, "not a host", ...raws],
      "Certificate name"
    );
    expect(found[0]).toEqual({
      type: "domain",
      value: "www.acme.test",
      source: "Certificate name",
    });
    expect(found).toHaveLength(301);
  });
});

describe("Cap found readers", () => {
  it("CT lists every certificate name, past the Proposal's batch limit", () => {
    const domains = Array.from({ length: 213 }, (_, i) => `h${i}.acme.test`);
    const found = ctLookup.found?.({
      host: "acme.test",
      source: "crt.sh",
      queriedAt: "2026-11-19T00:00:00Z",
      entries: [],
      domains,
    });
    expect(found).toHaveLength(213);
    expect(found?.every((v) => v.source === "Certificate name")).toBe(true);
  });

  it("DNS lists A, AAAA, NS and MX values with where each came from", () => {
    const found = dnsLookup.found?.({
      host: "acme.test",
      a: ["192.0.2.1"],
      aaaa: ["2001:db8::1"],
      mx: [{ priority: 10, exchange: "mx1.mail.test" }],
      txt: [["v=spf1 -all"]],
      ns: ["ns1.dns.test"],
    });
    expect(found?.map((v) => [v.type, v.value, v.source])).toEqual([
      ["ip", "192.0.2.1", "A record"],
      ["ip", "2001:db8::1", "AAAA record"],
      ["domain", "ns1.dns.test", "NS record"],
      ["domain", "mx1.mail.test", "MX record"],
    ]);
  });

  it("urlscan lists the domains and URLs its scans saw", () => {
    const found = urlscanLookup.found?.({
      host: "acme.test",
      queriedAt: "2026-11-19T00:00:00Z",
      source: "urlscan.io/api/v1/search",
      total: 2,
      urls: ["https://acme.test/login"],
      domains: ["cdn.acme.test"],
      hits: [],
    });
    expect(found?.map((v) => [v.type, v.value])).toEqual([
      ["domain", "cdn.acme.test"],
      ["url", "https://acme.test/login"],
    ]);
  });

  it("reads nothing from a report that is not the Cap's shape", () => {
    expect(dnsLookup.found?.({ nope: true })).toBeUndefined();
  });
});
