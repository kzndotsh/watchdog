import { describe, expect, it } from "vitest";

import { whoisSnapshotSchema } from "../schema";

describe("whois schema", () => {
  it("parses WHOIS snapshots", () => {
    const snap = whoisSnapshotSchema.parse({
      host: "example.com",
      source: "rdap",
      registrar: "Example Registrar",
      registrantOrg: null,
      nameservers: ["ns1.example.com"],
      status: ["client transfer prohibited"],
      registeredAt: "2000-01-01T00:00:00.000Z",
      expiresAt: null,
      raw: {},
    });
    expect(snap.host).toBe("example.com");
  });
});
