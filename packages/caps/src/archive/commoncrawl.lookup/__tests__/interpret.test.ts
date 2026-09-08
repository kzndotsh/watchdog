import { describe, it, expect } from "vitest";

import {
  expectNoConfidenceOnPatch,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { commoncrawlLookup } from "../cap.ts";
import { interpretCommoncrawlLookupReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    host: "example.com",
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "index.commoncrawl.org" as const,
    indexes: ["CC-MAIN-2026-30"],
    urls: ["https://example.com/", "https://www.example.com/page"],
    hits: [
      {
        url: "https://example.com/",
        timestamp: "20260710071441",
        status: "200",
        mime: "text/html",
        indexId: "CC-MAIN-2026-30",
      },
    ],
  };

  it("interpretCommoncrawlLookupReport proposes url Identifiers", () => {
    const result = interpretCommoncrawlLookupReport(fixture, {
      input: { host: "example.com", entityId },
    });
    expect(result.patch.filter((p) => p.resource === "identifier").length).toBe(
      3
    );
    expectProposesIdentifier(result, { type: "domain", value: "example.com" });
    expect(result.patch.at(-1)?.resource).toBe("claim");
    expectNoConfidenceOnPatch(result);
  });

  itRejectsIncompleteReport(
    commoncrawlLookup,
    { host: "example.com" },
    { host: "example.com" }
  );
});
