import { describe, expect, it } from "vitest";

import { testId } from "#test-kit";
import { fc } from "#test-kit/fc";

import { fingerprintPatchOp } from "../fingerprint.ts";
import { buildClaimCreateOp } from "../testing";

describe("fingerprintPatchOp properties", () => {
  it("is deterministic for arbitrary claim text", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (text) => {
        const op = buildClaimCreateOp(testId(20), text);
        expect(fingerprintPatchOp(op)).toBe(fingerprintPatchOp({ ...op }));
      })
    );
  });
});
