import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseCommoncrawlCdxText } from "../../archive/commoncrawl.ts";
import { isRecord } from "../../parse/coerce.ts";
import { parseIpctlBody } from "../ipctl.ts";
import { parseMnemonicPdnsBody } from "../mnemonic.ts";

function loadFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      path.join(import.meta.dirname, "..", "__fixtures__", name),
      "utf-8"
    )
  ) as unknown;
}

describe("mnemonic parse", () => {
  it("maps firstSeenTimestamp / lastSeenTimestamp / times", () => {
    const snap = parseMnemonicPdnsBody(
      "8.8.8.8",
      "ip",
      "2026-01-01T00:00:00.000Z",
      loadFixture("mnemonic-pdns.json")
    );
    expect(snap.count).toBe(2);
    expect(snap.records[0]?.rrtype).toBe("a");
    expect(snap.records[0]?.times).toBe(12);
    expect(snap.records[0]?.firstSeenAt).toBe("2021-01-01T00:00:00.000Z");
    expect(snap.records[0]?.lastSeenAt).toBe("2025-01-01T00:00:00.000Z");
    expect(snap.domains).toContain("dns.google");
  });

  it("falls back to firstSeen / lastSeen when Timestamp fields are absent", () => {
    const snap = parseMnemonicPdnsBody(
      "8.8.8.8",
      "ip",
      "2026-01-01T00:00:00.000Z",
      {
        responseCode: 200,
        data: [
          {
            query: "dns.google",
            answer: "8.8.8.8",
            rrtype: "A",
            firstSeen: 1_609_459_200_000,
            lastSeen: 1_735_689_600_000,
          },
        ],
      }
    );
    expect(snap.records[0]?.firstSeenAt).toBe("2021-01-01T00:00:00.000Z");
    expect(snap.records[0]?.lastSeenAt).toBe("2025-01-01T00:00:00.000Z");
  });
});

describe("ipctl parse", () => {
  it("maps docs-shaped reverse_dns / tags / geo without prefix", () => {
    const fixture = loadFixture("ipctl-docs-shape.json");
    if (!isRecord(fixture) || !isRecord(fixture.data)) {
      throw new TypeError("ipctl fixture missing data object");
    }
    const snap = parseIpctlBody(
      "8.8.8.8",
      "2026-01-01T00:00:00.000Z",
      fixture.data
    );
    expect(snap.asn).toBe(15_169);
    expect(snap.reverseDns).toBe("dns.google");
    expect(snap.tags).toEqual(["anycast", "dns"]);
    expect(snap.geoCountryName).toBe("United States");
    expect(snap.bgpPrefix).toBeNull();
  });
});

describe("commoncrawl CDX parse", () => {
  it("accepts a JSON array of objects (not only NDJSON)", () => {
    const rows = parseCommoncrawlCdxText(
      JSON.stringify([
        {
          url: "https://example.com/",
          timestamp: "20260101000000",
          status: "200",
          mime: "text/html",
        },
      ])
    );
    expect(rows[0]?.url).toBe("https://example.com/");
  });
});
