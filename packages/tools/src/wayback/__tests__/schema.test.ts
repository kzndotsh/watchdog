import { describe, expect, it } from "vitest";

import {
  waybackFetchSnapshotSchema,
  waybackLookupSnapshotSchema,
} from "../schema";

describe("wayback schema", () => {
  it("parses lookup and fetch snapshots", () => {
    const lookup = waybackLookupSnapshotSchema.parse({
      url: "https://example.com",
      queriedAt: "2026-01-01T00:00:00.000Z",
      source: "web.archive.org/cdx",
      rows: [{ timestamp: "20240101000000", original: "https://example.com" }],
      closestTimestamp: "20240101000000",
      distinctOnly: true,
      from: null,
      to: null,
      statusFilter: "ok",
      totalCaptures: 1,
      totalCapturesIsLowerBound: false,
      distinctVersions: 1,
      resumeKey: null,
      isTruncated: false,
    });
    expect(lookup.rows).toHaveLength(1);

    const fetch = waybackFetchSnapshotSchema.parse({
      url: "https://example.com",
      timestamp: "20240101000000",
      archiveUrl:
        "https://web.archive.org/web/20240101000000/https://example.com",
      queriedAt: "2026-01-01T00:00:00.000Z",
      status: 200,
      ok: true,
      contentType: "text/html",
      bodyPreview: "<html>",
      byteLength: 6,
    });
    expect(fetch.ok).toBe(true);
  });
});
