import { describe, expect, it } from "vitest";

import { domainValuesBatch, querySeedBatches } from "../query-seed-batches.ts";
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
      expect(validatedIdentifierValue("domain", value)).toBe(value);
    }
  });
});
