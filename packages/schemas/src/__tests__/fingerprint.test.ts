import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { fingerprintPatchOp } from "../fingerprint.ts";
import {
  buildClaimCreateOp,
  buildEdgeCreateOp,
  buildEntityCreateOp,
  buildEventCreateOp,
  buildIdentifierCreateOp,
} from "../testing";

describe("fingerprintPatchOp", () => {
  it("is stable for the same claim op", () => {
    const op = buildClaimCreateOp(testId(20), "Ada observed a host");
    expect(fingerprintPatchOp(op)).toBe(fingerprintPatchOp(op));
  });

  it("case-folds claim text", () => {
    const entityId = testId(20);
    expect(
      fingerprintPatchOp(buildClaimCreateOp(entityId, "Ada Observed"))
    ).toBe(fingerprintPatchOp(buildClaimCreateOp(entityId, "ada observed")));
  });

  it("uses the normalized identifier value and platform", () => {
    const entityId = testId(21);
    const mixed = buildIdentifierCreateOp(
      entityId,
      "email",
      "Ada@MailHost.TEST"
    );
    const folded = buildIdentifierCreateOp(
      entityId,
      "email",
      "ada@mailhost.test"
    );
    expect(fingerprintPatchOp(mixed)).toBe(fingerprintPatchOp(folded));
  });

  it("canonicalizes equivalent IPv6 spellings", () => {
    const entityId = testId(21);
    const expanded = buildIdentifierCreateOp(
      entityId,
      "ip",
      "2001:0db8:0000:0000:0000:0000:0000:0001"
    );
    const compressed = buildIdentifierCreateOp(entityId, "ip", "2001:db8::1");
    expect(fingerprintPatchOp(expanded)).toBe(fingerprintPatchOp(compressed));
  });

  it("fingerprints an event by entity, when, and what", () => {
    const op = buildEventCreateOp(testId(22), "1815-12-10", "Born");
    expect(fingerprintPatchOp(op)).toBe(`event|${testId(22)}|1815-12-10|born`);
  });

  it("canonicalizes symmetric edge endpoints", () => {
    const a = testId(30);
    const b = testId(31);
    const forward = buildEdgeCreateOp(a, b, "same_as", { id: testId(32) });
    const reverse = buildEdgeCreateOp(b, a, "same_as", { id: testId(32) });
    expect(fingerprintPatchOp(forward)).toBe(fingerprintPatchOp(reverse));
  });

  it("includes related_to notes in the edge fingerprint", () => {
    const a = testId(33);
    const b = testId(34);
    const one = buildEdgeCreateOp(a, b, "related_to", {
      data: { notes: "Same household" },
    });
    const two = buildEdgeCreateOp(a, b, "related_to", {
      data: { notes: "Different rationale" },
    });
    expect(fingerprintPatchOp(one)).not.toBe(fingerprintPatchOp(two));
  });

  it("slugifies entity slugs in fingerprints", () => {
    const display = buildEntityCreateOp("Alpha", "Alpha Corp", "org");
    const slug = buildEntityCreateOp("Alpha", "alpha-corp", "org");
    expect(fingerprintPatchOp(display)).toBe(fingerprintPatchOp(slug));
    expect(fingerprintPatchOp(display)).toBe("entity|alpha-corp");
  });
});
