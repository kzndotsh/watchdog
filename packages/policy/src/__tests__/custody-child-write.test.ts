import { describe, expect, it } from "vitest";

import {
  CONFIRMED_REFUSED_MESSAGE,
  USER_OVERRIDE_REQUIRED_MESSAGE,
  childWriteViolation,
} from "../custody-child-write.ts";

const OVERRIDE_MSG =
  "Child Graph writes require a user override. Prefer proposals create or graph write.";
const CONFIRMED_MSG =
  "Agent and CLI child Graph writes refuse confidence=confirmed. Accept via Inbox or edit in Dossier.";

describe("childWriteViolation", () => {
  it("requires a user override", () => {
    for (const userOverride of [undefined, false, "true", 1]) {
      expect(
        childWriteViolation({ userOverride, confidence: "unverified" })
      ).toEqual({ kind: "user-override-required", message: OVERRIDE_MSG });
    }
    expect(USER_OVERRIDE_REQUIRED_MESSAGE).toBe(OVERRIDE_MSG);
  });

  it("refuses confirmed even with an override", () => {
    expect(
      childWriteViolation({ userOverride: true, confidence: "confirmed" })
    ).toEqual({ kind: "confirmed-refused", message: CONFIRMED_MSG });
    expect(CONFIRMED_REFUSED_MESSAGE).toBe(CONFIRMED_MSG);
  });

  it("allows an override with unverified, possible, or no confidence", () => {
    for (const confidence of ["unverified", "possible", undefined]) {
      expect(
        childWriteViolation({ userOverride: true, confidence })
      ).toBeNull();
    }
  });

  it("reports the missing override first when both are violated", () => {
    expect(
      childWriteViolation({ userOverride: false, confidence: "confirmed" })
        ?.kind
    ).toBe("user-override-required");
  });
});
