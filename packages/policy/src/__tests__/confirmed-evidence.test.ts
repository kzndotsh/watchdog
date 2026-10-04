import { describe, expect, it } from "vitest";

import { CONFIDENCE_TIERS } from "@watchdog/schemas/shared";

import {
  CONFIRMED_REQUIRES_EVIDENCE,
  confirmedEvidenceViolation,
  confirmedNeedsEvidence,
} from "../confirmed-evidence.ts";

describe("confirmedNeedsEvidence", () => {
  it("refuses confirmed with no evidence", () => {
    expect(
      confirmedNeedsEvidence({ confidence: "confirmed", evidenceCount: 0 })
    ).toBe(true);
  });

  it("allows confirmed with at least one piece of evidence", () => {
    expect(
      confirmedNeedsEvidence({ confidence: "confirmed", evidenceCount: 1 })
    ).toBe(false);
    expect(
      confirmedNeedsEvidence({ confidence: "confirmed", evidenceCount: 7 })
    ).toBe(false);
  });

  it("never refuses a non-confirmed tier", () => {
    for (const confidence of CONFIDENCE_TIERS) {
      if (confidence === "confirmed") continue;
      expect(confirmedNeedsEvidence({ confidence, evidenceCount: 0 })).toBe(
        false
      );
    }
  });

  it("treats a missing confidence as not confirmed", () => {
    expect(
      confirmedNeedsEvidence({ confidence: undefined, evidenceCount: 0 })
    ).toBe(false);
  });

  it("refuses a negative or non-finite count (fail closed)", () => {
    expect(
      confirmedNeedsEvidence({ confidence: "confirmed", evidenceCount: -1 })
    ).toBe(true);
    expect(
      confirmedNeedsEvidence({
        confidence: "confirmed",
        evidenceCount: Number.NaN,
      })
    ).toBe(true);
  });
});

describe("confirmedEvidenceViolation", () => {
  it("returns the one message when refused", () => {
    expect(
      confirmedEvidenceViolation({ confidence: "confirmed", evidenceCount: 0 })
    ).toBe(CONFIRMED_REQUIRES_EVIDENCE);
  });

  it("returns null when allowed", () => {
    expect(
      confirmedEvidenceViolation({ confidence: "confirmed", evidenceCount: 2 })
    ).toBeNull();
    expect(
      confirmedEvidenceViolation({ confidence: "unverified", evidenceCount: 0 })
    ).toBeNull();
  });

  it("states the rule in the user-facing words", () => {
    expect(CONFIRMED_REQUIRES_EVIDENCE).toBe(
      "confirmed requires at least one Evidence attachment"
    );
  });
});
