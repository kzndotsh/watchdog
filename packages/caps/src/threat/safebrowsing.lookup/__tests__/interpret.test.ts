import { describe, it, expect } from "vitest";

import {
  claimText,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { safebrowsingLookup } from "../cap.ts";
import { interpretSafebrowsingLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    url: "http://malicious.example.com/",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "safebrowsing.googleapis.com" as const,
    found: true,
    matches: [{ threatType: "MALWARE", platformType: "ANY_PLATFORM" }],
  };

  it("interpretSafebrowsingLookupReport proposes url Identifier + Claim", () => {
    const result = interpretSafebrowsingLookupReport(fixture, {
      input: { url: fixture.url, entityId },
    });
    expectProposesIdentifier(result, {
      type: "url",
      value: "http://malicious.example.com",
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(/Safe Browsing/);
    expect(claimText(result, 1)).toMatch(/MALWARE/);
  });

  itRejectsIncompleteReport(
    safebrowsingLookup,
    { url: "http://x.example.com" },
    { url: "http://x.example.com" }
  );
});
