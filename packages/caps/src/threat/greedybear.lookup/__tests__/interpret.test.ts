import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { greedybearLookup } from "../cap.ts";
import { interpretGreedybearLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const foundFixture = {
    query: "1.2.3.4",
    kind: "ip" as const,
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "greedybear.honeynet.org" as const,
    found: true,
    feed: "all/scanner/recent" as const,
  };

  const notFoundFixture = { ...foundFixture, found: false };

  it("interpretGreedybearLookupReport flags scanner-feed membership", () => {
    const result = interpretGreedybearLookupReport(foundFixture, {
      input: { query: foundFixture.query, entityId },
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(/seen scanning honeypots/);
  });

  it("interpretGreedybearLookupReport reports non-membership", () => {
    const result = interpretGreedybearLookupReport(notFoundFixture, {
      input: { query: notFoundFixture.query, entityId },
    });
    expect(claimText(result, 1)).toMatch(/not seen scanning honeypots/);
  });

  itRejectsIncompleteReport(
    greedybearLookup,
    { query: "1.2.3.4" },
    { query: "1.2.3.4" }
  );
});
