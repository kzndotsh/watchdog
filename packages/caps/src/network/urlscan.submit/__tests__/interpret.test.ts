import { describe, it, expect } from "vitest";

import {
  claimText,
  expectProposesIdentifier,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { urlscanSubmit } from "../cap.ts";
import { interpretUrlscanSubmitReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    url: "https://example.com/",
    visibility: "unlisted" as const,
    queriedAt: "2026-01-01T00:00:00.000Z",
    source: "urlscan.io" as const,
    uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    resultUrl:
      "https://urlscan.io/result/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/",
    apiUrl:
      "https://urlscan.io/api/v1/result/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/",
    message: "Submission successful",
    accepted: true,
  };

  it("interpretUrlscanSubmitReport proposes url Identifier + Claim when entityId set", () => {
    const result = interpretUrlscanSubmitReport(fixture, {
      input: { url: fixture.url, entityId },
    });
    expectProposesIdentifier(result, {
      type: "url",
      value: "https://example.com",
    });
    expect(result.patch.length).toBe(2);
    expect(claimText(result, 1)).toMatch(/accepted \(unlisted\)/);
  });

  it("interpretUrlscanSubmitReport empty patch without entityId", () => {
    const result = interpretUrlscanSubmitReport(fixture, {
      input: { url: fixture.url },
    });
    expect(result.patch).toEqual([]);
  });

  itRejectsIncompleteReport(
    urlscanSubmit,
    { url: "https://example.com/" },
    { url: "https://example.com/" }
  );
});
