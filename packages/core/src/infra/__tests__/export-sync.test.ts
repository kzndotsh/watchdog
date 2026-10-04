import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  removeCaseExportDirEffect,
  renameCaseExportDirEffect,
  safeFilename,
  scheduleCaseExportEffect,
} from "../export-sync.ts";
import { runDomain } from "../run-domain";

describe("safeFilename", () => {
  it("strips path separators and control characters", () => {
    expect(safeFilename("evil/../etc\u0001pass")).toBe("evil_.._etc_pass");
    expect(safeFilename("a/b:c*d?")).not.toMatch(/[/\\:]/);
  });
});

describe("export path guards", () => {
  it("ignores path-traversal slugs for remove and rename", async () => {
    await expect(
      Effect.runPromise(removeCaseExportDirEffect("org-1", "../outside"))
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(
        renameCaseExportDirEffect("org-1", "../outside", "safe-slug")
      )
    ).resolves.toBeUndefined();
  });
});

describe("scheduleCaseExportEffect", () => {
  it("coalesces concurrent schedules into one in-flight write then a follow-up", async () => {
    let calls = 0;
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const writeExport = () =>
      Effect.gen(function* writeExportGen() {
        calls += 1;
        if (calls === 1) {
          yield* Effect.promise(() => firstGate);
        }
      });

    const caseId = testId(99);
    const first = runDomain(scheduleCaseExportEffect(caseId, writeExport));
    await vi.waitFor(() => {
      expect(calls).toBe(1);
    });
    // Marking happens when the Effect is interpreted: let the second schedule
    // mark the case dirty while the first write is still in flight.
    const second = runDomain(scheduleCaseExportEffect(caseId, writeExport));
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(calls).toBe(1);

    releaseFirst();
    await Promise.all([first, second]);
    expect(calls).toBe(2);
  });
});
