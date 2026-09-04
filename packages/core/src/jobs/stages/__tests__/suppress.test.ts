import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { PatchOp } from "@watchdog/schemas";

const { suppressKnownFindings } = vi.hoisted(() => ({
  suppressKnownFindings: vi.fn(),
}));

vi.mock("../../../proposals/finding-suppress", () => ({
  suppressKnownFindings,
}));

import { createJobLog } from "../helpers";
import { suppressStageEffect } from "../suppress";

describe("suppressStage", () => {
  it("returns empty result for empty patch", async () => {
    const result = await Effect.runPromise(
      suppressStageEffect("case-1", [], createJobLog())
    );
    expect(result).toEqual({ kept: [], suppressed: 0 });
    expect(suppressKnownFindings).not.toHaveBeenCalled();
  });

  it("logs when findings are suppressed", async () => {
    const patch: PatchOp[] = [
      {
        op: "create",
        resource: "identifier",
        data: { type: "email", value: "a@b.com" },
      },
    ];
    suppressKnownFindings.mockResolvedValueOnce({
      kept: [],
      suppressed: 1,
    });
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
