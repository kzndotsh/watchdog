import { describe, it, expect } from "vitest";

import { testId } from "@watchdog/domain/test-kit";

import { claimText, dataOf, itRejectsIncompleteReport } from "../../../testing";
import { waybackFetch } from "../cap.ts";
import { interpretWaybackFetchReport } from "../interpret.ts";

describe("interpret", () => {
  const entityId = testId(1);

  const fixture = {
    url: "https://example.com/",
    timestamp: "20260101000000",
    archiveUrl:
      "https://web.archive.org/web/20260101000000/https://example.com/",
    queriedAt: "2026-01-01T00:00:00.000Z",
    status: 200,
    ok: true,
    contentType: "text/html",
    bodyPreview: "<html></html>",
    byteLength: 13,
  };

  it("interpretWaybackFetchReport proposes url Identifier + Claim", () => {
    const result = interpretWaybackFetchReport(fixture, {
      input: {
        url: "https://example.com/",
        timestamp: "20260101000000",
        entityId,
      },
    });
    expect(result.patch[0]?.kind).toBe("identifier.create");
    expect(dataOf(result.patch[0]).type).toBe("url");
    expect(dataOf(result.patch[0]).value).toBe("https://example.com");
    expect(result.patch[1]?.kind).toBe("claim.create");
    expect(claimText(result, 1)).toMatch(/status=200/);
    expect(claimText(result, 1)).toMatch(/bytes=13/);
  });

  itRejectsIncompleteReport(
    waybackFetch,
    { url: "https://example.com/" },
    {
      url: "https://example.com/",
      timestamp: "20260101000000",
    }
  );
});
