import { describe, expect, it } from "vitest";

import { txtInventorySnapshotSchema } from "../txt-inventory-schema";

describe("txtInventorySnapshotSchema", () => {
  it("parses TXT inventory snapshots with classified tokens", () => {
    const snap = txtInventorySnapshotSchema.parse({
      host: "example.com",
      queriedAt: "2026-01-01T00:00:00.000Z",
      records: ["v=spf1 -all"],
      tokens: [
        {
          record: "v=spf1 -all",
          kind: "spf",
          service: null,
          product: null,
        },
      ],
    });
    expect(snap.tokens[0]?.kind).toBe("spf");
  });
});
