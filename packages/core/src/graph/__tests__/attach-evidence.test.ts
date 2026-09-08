import { describe, expect, it } from "vitest";

import { testId,buildClaimCreateOp } from "@watchdog/test-kit";

import { attachEvidenceIds } from "../attach-evidence";

describe("attachEvidenceIds", () => {
  it("trims and dedupes shared and per-op evidence ids", () => {
    const entityId = testId(20);
    const evidenceA = testId(30);
    const evidenceB = testId(31);
    const claimId = testId(40);
    const patch = [
      buildClaimCreateOp(entityId, "observed", {
        id: claimId,
        evidenceIds: [`  ${evidenceA}  `],
      }),
    ];

    const merged = attachEvidenceIds(patch, [`  ${evidenceB}  `, evidenceA]);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.patch[0]?.evidenceIds).toEqual([evidenceA, evidenceB]);
  });

  it("returns the patch unchanged when shared ids are blank after trim", () => {
    const entityId = testId(21);
    const claimId = testId(41);
    const patch = [buildClaimCreateOp(entityId, "observed", { id: claimId })];

    const merged = attachEvidenceIds(patch, ["  ", ""]);
    expect(merged).toEqual({ ok: true, patch });
  });

  it("rejects invalid shared evidence ids", () => {
    const entityId = testId(22);
    const claimId = testId(42);
    const patch = [buildClaimCreateOp(entityId, "observed", { id: claimId })];

    const merged = attachEvidenceIds(patch, ["not-a-uuid"]);
    expect(merged).toEqual({
      ok: false,
      error: "attachEvidenceIds contains an invalid UUID",
    });
  });

  it("rejects invalid per-op evidence ids", () => {
    const entityId = testId(23);
    const evidenceId = testId(43);
    const claimId = testId(44);
    const patch = [
      buildClaimCreateOp(entityId, "observed", {
        id: claimId,
        evidenceIds: ["not-a-uuid"],
      }),
    ];

    const merged = attachEvidenceIds(patch, [evidenceId]);
    expect(merged).toEqual({
      ok: false,
      error: "One or more Evidence ids are invalid",
    });
  });
});
