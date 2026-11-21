import { describe, it, expect } from "vitest";

import { c99LookupSnapshotSchema } from "../c99.ts";

describe("c99-schema", () => {
  it("c99LookupSnapshotSchema accepts typical API-shaped hits", () => {
    const snap = c99LookupSnapshotSchema.parse({
      host: "example.com",
      queriedAt: "2026-01-01T00:00:00.000Z",
      source: "api.c99.nl/subdomainfinder",
      realtime: false,
      domains: ["a.example.com"],
      hits: [{ subdomain: "a.example.com", ip: "1.2.3.4", cloudflare: true }],
      error: null,
    });
    expect(snap.hits[0]?.cloudflare).toBe(true);
  });
});
