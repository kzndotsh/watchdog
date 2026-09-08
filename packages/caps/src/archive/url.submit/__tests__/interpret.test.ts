import { describe, it, expect } from "vitest";

import {
  claimText,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { urlSubmit } from "../cap.ts";
import { interpretArchiveUrlSubmitReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    url: "https://example.com/",
    queriedAt: "2026-01-01T00:00:00.000Z",
    results: [
      {
        service: "wayback" as const,
        accepted: true,
        archiveUrl: "https://web.archive.org/web/*/https://example.com/",
        detail: "HTTP 200",
        status: 200,
      },
    ],
  };

  it("interpretArchiveUrlSubmitReport proposes url Identifier + Claim when entityId set", () => {
    const result = interpretArchiveUrlSubmitReport(fixture, {
      input: { url: "https://example.com/", entityId },
    });
    expectProposesIdentifier(result, {
      type: "url",
      value: "https://example.com",
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(/wayback accepted=true/);
  });

  it("interpretArchiveUrlSubmitReport empty patch without entityId", () => {
    const result = interpretArchiveUrlSubmitReport(fixture, {
      input: { url: "https://example.com/" },
    });
    expect(result.patch).toEqual([]);
  });

  itRejectsIncompleteReport(
    urlSubmit,
    { url: "https://example.com/" },
    { url: "https://example.com/" }
  );
});
