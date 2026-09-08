import { describe, expect, it } from "vitest";

import {
  domainValuesBatch,
  ipValuesBatch,
  querySeedBatches,
} from "../query-seed-batches.ts";
import { validatedIdentifierValue } from "../validated-identifier-value.ts";

describe("collect identifier normalization contract", () => {
  it("querySeedBatches domain seeds match validatedIdentifierValue", () => {
    const inputs = [
      "example.com",
      "EXAMPLE.COM",
      "*.wildcard.example",
      "not-valid",
      "api.example.com",
    ];
    for (const raw of inputs) {
      const batch = querySeedBatches(raw, "domain");
      const expected = validatedIdentifierValue("domain", raw);
      if (expected === null) {
        expect(batch).toEqual([]);
      } else {
        expect(batch).toEqual([{ type: "domain", values: [expected] }]);
      }
    }
  });

  it("domainValuesBatch only emits validatedIdentifierValue outputs", () => {
    const batch = domainValuesBatch([
      "*.example.com",
      "EXAMPLE.com",
      "nodot",
      "api.example.com",
    ]);
    const values = batch[0]?.values ?? [];
    expect(values).toEqual(["example.com", "api.example.com"]);
    for (const value of values) {
      if (typeof value !== "string") continue;
      expect(validatedIdentifierValue("domain", value)).toBe(value);
    }
  });

  it("ipValuesBatch canonicalizes equivalent IPv6 spellings", () => {
    const batch = ipValuesBatch([
      "2001:0db8:0000:0000:0000:0000:0000:0001",
      "2001:db8::1",
    ]);
    expect(batch).toEqual([{ type: "ip", values: ["2001:db8::1"] }]);
  });
});
