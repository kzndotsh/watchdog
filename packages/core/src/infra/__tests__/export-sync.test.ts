import { Deferred, Effect } from "effect";
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

  it.each([2, 5])(
    "runs %i simultaneous schedules as one in-flight write plus at most one follow-up",
    async (n) => {
      let started = 0;
      let active = 0;
      let maxActive = 0;

      const program = Effect.gen(function* programGen() {
        const gate = yield* Deferred.make<undefined>();
        const writeExport = () =>
          Effect.gen(function* writeExportGen() {
            started += 1;
            active += 1;
            maxActive = Math.max(maxActive, active);
            // Only the first write blocks; the follow-up (if any) runs straight through.
            if (started === 1) yield* Deferred.await(gate);
            active -= 1;
          });
        const caseId = testId(98);
        const schedule = scheduleCaseExportEffect(caseId, writeExport);
        // The releaser is queued after every schedule fiber, so all of them have
        // interpreted (marked dirty, started or joined) before the first write may
        // finish: no sleeps, ordering comes from the fiber run queue.
        const release = Effect.gen(function* releaseGen() {
          for (let i = 0; i < 10; i += 1) yield* Effect.yieldNow;
          expect(started).toBe(1);
          yield* Deferred.succeed(gate, undefined);
        });
        yield* Effect.all(
          [...Array.from({ length: n }, () => schedule), release],
          { concurrency: "unbounded" }
        );
      });

      await runDomain(program);

      expect(maxActive).toBe(1);
      // Schedules that mark dirty before the write fiber claims it collapse into
      // that one write; later ones yield exactly one follow-up. Never more.
      expect(started).toBeGreaterThanOrEqual(1);
      expect(started).toBeLessThanOrEqual(2);
    }
  );
});
