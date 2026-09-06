import { describe, expect, it } from "vitest";

import {
  CONFIRMED_REQUIRES_EVIDENCE,
  isConfirmedBlocked,
} from "@/shared/lib/confirmed-evidence";

import { claimEvidenceIdsValidator } from "../claim-form.ts";

describe("isConfirmedBlocked", () => {
  it("blocks confirmed with zero evidence", () => {
    expect(isConfirmedBlocked("confirmed", [])).toBe(true);
    expect(isConfirmedBlocked("confirmed", ["e"])).toBe(false);
    expect(isConfirmedBlocked("unverified", [])).toBe(false);
  });
});

describe("claimEvidenceIdsValidator", () => {
  it("returns the confirmed-requires-evidence message", () => {
    const message = claimEvidenceIdsValidator({
      value: [],
      fieldApi: { form: { getFieldValue: () => "confirmed" } },
    });
    expect(message).toBe(CONFIRMED_REQUIRES_EVIDENCE);
  });
});
