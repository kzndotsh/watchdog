import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { PatchOp } from "@watchdog/schemas";

const { suppressKnownFindingsEffect } = vi.hoisted(() => ({
  suppressKnownFindingsEffect: vi.fn(),
}));

vi.mock("../../../proposals/finding-suppress", () => ({
  suppressKnownFindingsEffect,
}));

import { createJobLog } from "../helpers";
import { suppressStageEffect } from "../suppress";

describe("suppressStage", () => {
  it("returns empty result for empty patch", async () => {
    const result = await Effect.runPromise(
      suppressStageEffect("case-1", [], createJobLog())
    );
    expect(result).toEqual({ kept: [], suppressed: 0 });
    expect(suppressKnownFindingsEffect).not.toHaveBeenCalled();
  });

  it("logs when findings are suppressed", async () => {
    const patch: PatchOp[] = [
      {
        op: "create",
        resource: "identifier",
        data: { type: "email", value: "a@b.com" },
      },
    ];
    suppressKnownFindingsEffect.mockReturnValueOnce(
      Effect.succeed({
        kept: [],
        suppressed: 1,
      })
    );
    const jobLog = createJobLog();
    const result = await Effect.runPromise(
      suppressStageEffect("case-1", patch, jobLog)
    );
    expect(result.suppressed).toBe(1);
    expect(jobLog.lines.some((line) => line.includes("suppressed 1"))).toBe(
      true
    );
  });
});
