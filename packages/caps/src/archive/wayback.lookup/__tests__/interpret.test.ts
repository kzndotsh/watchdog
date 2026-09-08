import { describe, it, expect } from "vitest";

import {
  claimText,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { waybackLookup } from "../cap.ts";
import { interpretWaybackLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    url: "https://example.com/",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "web.archive.org/cdx" as const,
    rows: [
      {
        timestamp: "20260101000000",
        original: "https://example.com/",
        statuscode: "200",
      },
    ],
    closestTimestamp: "20260101000000",
  };

  it("interpretWaybackLookupReport proposes url Identifier + Claim", () => {
    const result = interpretWaybackLookupReport(fixture, {
      input: { url: "https://example.com/", entityId },
    });
    expectProposesIdentifier(result, {
      type: "url",
      value: "https://example.com",
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(/1 snapshot/);
    expect(claimText(result, 1)).toMatch(/20260101000000/);
  });

  itRejectsIncompleteReport(
    waybackLookup,
    { url: "https://example.com/" },
    { url: "https://example.com/" }
  );
});
