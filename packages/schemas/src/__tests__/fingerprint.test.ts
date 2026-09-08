import { describe, expect, it } from "vitest";

import {
  buildClaimCreateOp,
  buildEntityCreateOp,
  buildEventCreateOp,
  buildIdentifierCreateOp,
  testId,
} from "@watchdog/test-kit";

import { fingerprintPatchOp } from "../fingerprint.ts";

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

  it("fingerprints an event by entity, when, and what", () => {
    const op = buildEventCreateOp(testId(22), "1815-12-10", "Born");
    expect(fingerprintPatchOp(op)).toBe(`event|${testId(22)}|1815-12-10|born`);
  });

  it("canonicalizes symmetric edge endpoints", () => {
    const a = testId(30);
    const b = testId(31);
    const forward = {
      op: "create" as const,
      resource: "edge" as const,
      id: testId(32),
      data: { fromId: a, toId: b, predicate: "same_as" },
    };
    const reverse = {
      ...forward,
      data: { fromId: b, toId: a, predicate: "SAME_AS" },
    };
    expect(fingerprintPatchOp(forward)).toBe(fingerprintPatchOp(reverse));
  });

  it("includes related_to notes in the edge fingerprint", () => {
    const a = testId(33);
    const b = testId(34);
    const one = {
      op: "create" as const,
      resource: "edge" as const,
      id: testId(35),
      data: {
        fromId: a,
        toId: b,
        predicate: "related_to",
        notes: "Same household",
      },
    };
    const two = {
      ...one,
      data: { ...one.data, notes: "Different rationale" },
    };
    expect(fingerprintPatchOp(one)).not.toBe(fingerprintPatchOp(two));
  });

  it("slugifies entity slugs in fingerprints", () => {
    const display = buildEntityCreateOp("Alpha", "Alpha Corp", "org");
    const slug = buildEntityCreateOp("Alpha", "alpha-corp", "org");
    expect(fingerprintPatchOp(display)).toBe(fingerprintPatchOp(slug));
    expect(fingerprintPatchOp(display)).toBe("entity|alpha-corp");
  });
});
