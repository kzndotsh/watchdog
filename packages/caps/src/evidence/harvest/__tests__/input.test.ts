import { describe, expect, it } from "vitest";

import { evidenceHarvestInput } from "../input";

describe("evidence.harvest input", () => {
  it("trims required evidenceId and optional entityId", () => {
    const evidenceId = "00000000-0000-4000-8000-000000000040";
    const entityId = "00000000-0000-4000-8000-000000000050";
    expect(
      evidenceHarvestInput.parse({
        evidenceId: `  ${evidenceId}  `,
        entityId: `  ${entityId}  `,
      })
    ).toEqual({ evidenceId, entityId });
  });

  it("treats whitespace-only entityId as absent", () => {
    const evidenceId = "00000000-0000-4000-8000-000000000040";
    expect(
      evidenceHarvestInput.parse({
        evidenceId,
        entityId: "   ",
      })
    ).toEqual({ evidenceId });
  });
});
