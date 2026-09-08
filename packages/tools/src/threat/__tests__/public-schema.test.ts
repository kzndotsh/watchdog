import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isRecord } from "../../parse/coerce.ts";
import { parseTxtAnswer } from "../cymru-mhr.ts";
import { parseDshieldBody } from "../dshield.ts";
import { parseFeodoEntries } from "../feodo.ts";
import { parseIpv6ExactLine } from "../firehol.ts";
import { parseGreedybearIocValues } from "../greedybear.ts";
import { hashlookupSnapshotSchema } from "../hashlookup.ts";

function loadFixture(name: string): unknown {
  return JSON.parse(
    readFileSync(
      path.join(import.meta.dirname, "..", "__fixtures__", name),
      "utf-8"
    )
  ) as unknown;
}

describe("dshield parse", () => {
  it("reads nested ip.count / attacks / threatfeeds", () => {
    const body = loadFixture("dshield-ip.json");
    if (!isRecord(body) || !isRecord(body.ip)) {
      throw new TypeError("dshield fixture missing ip object");
    }
    const snap = parseDshieldBody(
      "1.2.3.4",
      "2026-01-01T00:00:00.000Z",
      body.ip
    );
    expect(snap.attacks).toBe(34);
    expect(snap.count).toBe(9843);
    expect(snap.asn).toBe(4134);
    expect(snap.asCountry).toBe("CN");
    expect(snap.firstSeen).toBe("2020-01-01");
    expect(snap.threatFeedCount).toBe(2);
    expect(snap.found).toBe(true);
  });

  it("treats threatfeeds-only payloads as found", () => {
    const snap = parseDshieldBody("1.2.3.4", "2026-01-01T00:00:00.000Z", {
      threatfeeds: { spamhaus: "2026-01-01" },
    });
    expect(snap.found).toBe(true);
    expect(snap.threatFeedCount).toBe(1);
    expect(snap.attacks).toBeNull();
    expect(snap.count).toBeNull();
  });
});

describe("greedybear parse", () => {
  it("indexes public feed iocs[].value (not enrichment Token API)", () => {
    const values = parseGreedybearIocValues(
      loadFixture("greedybear-feed.json")
    );
    expect(values.has("1.2.3.4")).toBe(true);
    expect(values.has("evil.example")).toBe(true);
  });
});

describe("feodo parse", () => {
  it("accepts ip_address and ip keys", () => {
    const rows = parseFeodoEntries([
      { ip_address: "1.2.3.4", malware: "Dridex" },
      { ip: "5.6.7.8", malware: "Emotet" },
    ]);
    expect(rows.map((r) => r.ipAddress)).toEqual(["1.2.3.4", "5.6.7.8"]);
  });
});

describe("firehol parse", () => {
  it("keeps exact IPv6 /128 rows", () => {
    expect(parseIpv6ExactLine("2001:db8::1")).not.toBeNull();
    expect(parseIpv6ExactLine("2001:db8::/32")).toBeNull();
  });
});

describe("cymru mhr parse", () => {
  it("parses TXT epoch + detection percent (not A-record)", () => {
    expect(parseTxtAnswer([["1609459200", " 80"]])).toEqual({
      lastSeenEpoch: 1_609_459_200,
      detectionPct: 80,
    });
  });

  it("returns null fields for unparseable TXT", () => {
    expect(parseTxtAnswer([["not-a-malware-txt"]])).toEqual({
      lastSeenEpoch: null,
      detectionPct: null,
    });
  });
});

describe("hashlookup schema", () => {
  it("keeps sibling hashes, parents/children, hashlookup:trust", () => {
    const snap = hashlookupSnapshotSchema.parse({
      hash: "44d88612fea8a8f36de82e1278abb02f",
      algo: "md5",
      queriedAt: "2026-01-01T00:00:00.000Z",
      source: "hashlookup.circl.lu",
      found: true,
      trust: 80,
      fileName: "eicar.com",
      product: "EICAR",
      md5: "44d88612fea8a8f36de82e1278abb02f",
      sha1: "3395856ce81f2b7382dee72602f798b642f14140",
      sha256: "a".repeat(64),
      parentCount: 1,
      childCount: 2,
    });
    expect(snap.trust).toBe(80);
    expect(snap.sha1).toHaveLength(40);
    expect(snap.parentCount).toBe(1);
  });
});
