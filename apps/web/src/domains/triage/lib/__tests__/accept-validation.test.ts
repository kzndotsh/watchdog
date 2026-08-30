import { describe, expect, it } from "vitest";

import { isConfirmedWithoutBundle } from "../accept-validation.ts";

describe("isConfirmedWithoutBundle", () => {
  it("returns true only for confirmed with zero evidence", () => {
    expect(isConfirmedWithoutBundle("confirmed", [], [], "")).toBe(true);
    expect(isConfirmedWithoutBundle("unverified", [], [], "")).toBe(false);
    expect(isConfirmedWithoutBundle("possible", [], [], "")).toBe(false);
  });

  it("counts attestation text as evidence", () => {
    expect(isConfirmedWithoutBundle("confirmed", [], [], "I saw it")).toBe(
      false
    );
    expect(isConfirmedWithoutBundle("confirmed", [], [], "   ")).toBe(true);
  });

  it("counts linkedIds as evidence", () => {
    expect(isConfirmedWithoutBundle("confirmed", [], ["evidence-1"], "")).toBe(
      false
    );
  });
});
