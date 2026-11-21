import { describe, expect, it } from "vitest";

import { archiveSubmitSnapshotSchema } from "../submit-schema";

describe("wayback submit schema", () => {
  it("parses archive submit snapshots", () => {
    const snap = archiveSubmitSnapshotSchema.parse({
      url: "https://example.com",
      queriedAt: "2026-01-01T00:00:00.000Z",
      results: [
        {
          service: "wayback",
          accepted: true,
          archiveUrl: "https://web.archive.org/save/https://example.com",
          detail: null,
          status: 200,
        },
      ],
    });
    expect(snap.results[0]?.accepted).toBe(true);
  });
});
