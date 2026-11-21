import { describe, expect, it } from "vitest";

import { mailConfigSnapshotSchema } from "../mail-config-schema";

describe("mail-config schema", () => {
  it("parses MX/SPF/DMARC/DKIM posture snapshots", () => {
    const snap = mailConfigSnapshotSchema.parse({
      host: "example.com",
      queriedAt: "2026-01-01T00:00:00.000Z",
      mx: [{ exchange: "mx.example.com", priority: 10 }],
      spf: { present: true, records: ["v=spf1 -all"] },
      dmarc: { present: false, records: [] },
      dkim: {
        selectorsTried: ["default"],
        found: [],
      },
      txt: ["v=spf1 -all"],
    });
    expect(snap.spf.present).toBe(true);
    expect(snap.mx[0]?.exchange).toBe("mx.example.com");
  });
});
