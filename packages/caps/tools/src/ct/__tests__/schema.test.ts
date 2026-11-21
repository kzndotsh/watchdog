import { describe, expect, it } from "vitest";

import { ctCertEntrySchema, ctLookupSnapshotSchema } from "../schema";

describe("ct schema", () => {
  it("parses CT lookup snapshots and cert entries", () => {
    const entry = ctCertEntrySchema.parse({
      commonName: "example.com",
      nameValue: "example.com\nwww.example.com",
      issuer: "CA",
      notBefore: "2026-01-01",
      notAfter: "2026-07-01",
      serial: "1",
    });
    expect(entry.commonName).toBe("example.com");

    const snap = ctLookupSnapshotSchema.parse({
      host: "example.com",
      source: "crt.sh",
      queriedAt: "2026-01-01T00:00:00.000Z",
      entries: [entry],
      domains: ["example.com", "www.example.com"],
    });
    expect(snap.entries).toHaveLength(1);
  });
});
