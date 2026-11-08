import { describe, expect, it } from "vitest";

import { claimSchema } from "../graph-records";

const claim = {
  id: "00000000-0000-4000-8000-000000000010",
  entityId: "00000000-0000-4000-8000-000000000011",
  class: "observation",
  text: "Observed handle",
  confidence: "unverified",
  retracted: false,
  retractKind: null,
  retractedReason: null,
  retractedBy: null,
  retractedAt: null,
  evidenceIds: [],
  version: 1,
};

describe("claimSchema", () => {
  it("returns the wire shape of a claim unchanged", () => {
    expect(claimSchema.parse(claim)).toEqual(claim);
  });

  it("rejects an unknown confidence tier", () => {
    expect(
      claimSchema.safeParse({ ...claim, confidence: "certain" }).success
    ).toBe(false);
  });

  it("rejects a version that is not positive", () => {
    expect(claimSchema.safeParse({ ...claim, version: 0 }).success).toBe(false);
  });
});
