import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/domain/test-kit";

import { claimText, dataOf, itRejectsIncompleteReport } from "../../../testing";
import { trancoLookup } from "../cap.ts";
import { interpretTrancoLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const foundFixture = {
    domain: "example.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "tranco-list.eu" as const,
    found: true,
    latestRank: 12_345,
    latestDate: "2026-01-01",
    ranksCount: 30,
  };

  const notFoundFixture = {
    domain: "example.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "tranco-list.eu" as const,
    found: false,
    latestRank: null,
    latestDate: null,
    ranksCount: 0,
  };

  it("interpretTrancoLookupReport proposes domain Identifier + observation Claim", () => {
    const result = interpretTrancoLookupReport(foundFixture, {
      input: { host: foundFixture.domain, entityId },
    });
    expect(result.patch[0]?.kind).toBe("identifier.create");
    expect(dataOf(result.patch[0]).type).toBe("domain");
    expect(dataOf(result.patch[0]).value).toBe("example.com");
    expect(result.patch[1]?.kind).toBe("claim.create");
    expect(claimText(result, 1)).toMatch(/rank 12345/);
  });

  it("interpretTrancoLookupReport reports out-of-top-1M softly", () => {
    const result = interpretTrancoLookupReport(notFoundFixture, {
      input: { host: notFoundFixture.domain, entityId },
    });
    expect(result.patch[0]?.kind).toBe("identifier.create");
    expect(claimText(result, 1)).toMatch(/not in the top-1M/);
  });

  itRejectsIncompleteReport(
    trancoLookup,
    { domain: "example.com" },
    { host: "example.com" }
  );
});
