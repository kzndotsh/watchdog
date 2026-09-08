import { describe, it, expect } from "vitest";

import {
  claimText,
  itRejectsIncompleteReport,
  testId,
} from "@watchdog/test-kit";

import { urlUnshorten } from "../cap.ts";
import { interpretUnshortenReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    url: "https://t.co/abc",
    queriedAt: "2026-01-01T00:00:00.000Z",
    chain: [
      { url: "https://t.co/abc", status: 301 },
      { url: "https://example.com/", status: 200 },
    ],
    finalUrl: "https://example.com/",
    hopCount: 1,
  };

  it("interpretUnshortenReport proposes seed + final URL Identifiers + Claim", () => {
    const result = interpretUnshortenReport(fixture, {
      input: { url: "https://t.co/abc", entityId },
    });
    const ids = result.patch.filter((p) => p.resource === "identifier");
    expect(ids.map((p) => p.data.value)).toEqual([
      "https://t.co/abc",
      "https://example.com",
    ]);
    expect(claimText(result, 2)).toMatch(/1 hop\(s\)/);
  });

  itRejectsIncompleteReport(
    urlUnshorten,
    { url: "https://t.co/abc" },
    { url: "https://t.co/abc" }
  );
});
