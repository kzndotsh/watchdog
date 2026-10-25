import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  claimText,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
} from "../../../testing";
import { waybackLookup } from "../cap.ts";
import {
  describeWaybackLookup,
  interpretWaybackLookupReport,
} from "../interpret.ts";

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
    distinctOnly: true,
    from: null,
    to: null,
    statusFilter: "ok" as const,
    totalCaptures: 37,
    totalCapturesIsLowerBound: false,
    distinctVersions: 6,
    resumeKey: null,
    isTruncated: false,
  };

  it("interpretWaybackLookupReport proposes url Identifier + Claim", () => {
    const result = interpretWaybackLookupReport(fixture, {
      input: { url: "https://example.com/", entityId, distinctOnly: true },
    });
    expectProposesIdentifier(result, {
      type: "url",
      value: "https://example.com",
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(/37 captures, 6 distinct versions/);
    expect(claimText(result, 1)).toMatch(/20260101000000/);
  });

  it("marks a cut count and says more is available", () => {
    const text = describeWaybackLookup({
      ...fixture,
      totalCapturesIsLowerBound: true,
      isTruncated: true,
    });
    expect(text).toBe("37+ captures, 6+ distinct versions; more available");
  });

  it("says the capture count is unavailable instead of inventing one", () => {
    const text = describeWaybackLookup({ ...fixture, totalCaptures: null });
    expect(text).toBe("6 distinct versions (capture count unavailable)");
  });

  it("singularizes one capture and one version", () => {
    expect(
      describeWaybackLookup({
        ...fixture,
        totalCaptures: 1,
        distinctVersions: 1,
      })
    ).toBe("1 capture, 1 distinct version");
  });

  itRejectsIncompleteReport(
    waybackLookup,
    { url: "https://example.com/" },
    { url: "https://example.com/" }
  );
});
