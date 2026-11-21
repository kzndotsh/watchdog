import { describe, expect, it } from "vitest";

import { trancoLookupSnapshotSchema } from "../tranco.ts";

describe("trancoLookupSnapshotSchema", () => {
  it("accepts a ranked lookup snapshot", () => {
    const snap = trancoLookupSnapshotSchema.parse({
      domain: "example.com",
      queriedAt: "2026-01-01T00:00:00.000Z",
      source: "tranco-list.eu",
      found: true,
      latestRank: 42,
      latestDate: "2026-01-01",
      ranksCount: 3,
    });
    expect(snap.latestRank).toBe(42);
  });

  it("rejects an unknown source literal", () => {
    const parsed = trancoLookupSnapshotSchema.safeParse({
      domain: "example.com",
      queriedAt: "2026-01-01T00:00:00.000Z",
      source: "other",
      found: false,
      latestRank: null,
      latestDate: null,
      ranksCount: 0,
    });
    expect(parsed.success).toBe(false);
  });
});
