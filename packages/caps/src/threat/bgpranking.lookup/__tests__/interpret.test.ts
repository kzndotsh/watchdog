import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { bgprankingLookup } from "../cap.ts";
import { interpretBgprankingLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const foundFixture = {
    ip: "1.2.3.4",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "bgpranking-ng.circl.lu" as const,
    found: true,
    asn: 5577,
    asnDescription: "ROOT, LU",
    asnRank: 0.0004720052083333333,
    asnPosition: 7084,
  };

  const unmappedFixture = {
    ip: "1.2.3.4",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "bgpranking-ng.circl.lu" as const,
    found: true,
    asn: null,
    asnDescription: null,
    asnRank: null,
    asnPosition: null,
  };

  it("interpretBgprankingLookupReport proposes observation Claim with ASN and rank", () => {
    const result = interpretBgprankingLookupReport(foundFixture, {
      input: { ip: foundFixture.ip, entityId },
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(/AS5577/);
    expect(claimText(result, 1)).toMatch(/ROOT, LU/);
  });

  it("interpretBgprankingLookupReport reports unmapped ASN softly", () => {
    const result = interpretBgprankingLookupReport(unmappedFixture, {
      input: { ip: unmappedFixture.ip, entityId },
    });
    expect(claimText(result, 1)).toMatch(/unmapped/);
  });

  it("interpretBgprankingLookupReport reports not indexed when lookup missed", () => {
    const result = interpretBgprankingLookupReport(
      { ...unmappedFixture, found: false },
      { input: { ip: unmappedFixture.ip, entityId } }
    );
    expect(claimText(result, 1)).toMatch(/not indexed/);
  });

  itRejectsIncompleteReport(
    bgprankingLookup,
    { ip: "1.2.3.4" },
    { ip: "1.2.3.4" }
  );
});
