import { Deferred, Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { claimExportEventEffect } = vi.hoisted(() => ({
  claimExportEventEffect: vi.fn(() => Effect.succeed(Effect.void)),
}));

vi.mock("../export-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../export-events")>();
  return {
    ...actual,
    claimExportEventEffect,
  };
});

import { Db } from "@watchdog/core/worker";

import { handleExportEventPayloadEffect } from "../boot-worker";

describe("handleExportEventPayloadEffect", () => {
  beforeEach(() => {
    claimExportEventEffect.mockReset();
    claimExportEventEffect.mockReturnValue(Effect.succeed(Effect.void));
  });

  it("ignores malformed JSON without scheduling export", async () => {
    await Effect.runPromise(
      Effect.provide(handleExportEventPayloadEffect("{not json"), Db.layer)
    );
    expect(claimExportEventEffect).not.toHaveBeenCalled();
  });

  it("ignores valid JSON that fails the watchdog event schema", async () => {
    await Effect.runPromise(
      Effect.provide(
        handleExportEventPayloadEffect(JSON.stringify({ type: "unknown" })),
        Db.layer
      )
    );
    expect(claimExportEventEffect).not.toHaveBeenCalled();
  });

  it("schedules export for valid watchdog events", async () => {
    const event = {
      type: "entity_changed",
      caseId: "11111111-1111-4111-8111-000000000001",
    };
    await Effect.runPromise(
      Effect.provide(
        handleExportEventPayloadEffect(JSON.stringify(event)),
        Db.layer
      )
    );
    await vi.waitFor(() => {
      expect(claimExportEventEffect).toHaveBeenCalledWith(event);
    });
  });

  it("marks the case before forking, so an interrupted child cannot lose the mark", async () => {
    // The claim must run in the caller's fiber (before the fork). A claim that
    // ran inside the forked child would see a different fiber id.
    const seen: { claimFiber?: number; joined: boolean } = { joined: false };
    const gate = Deferred.makeUnsafe<undefined>();
    claimExportEventEffect.mockReturnValue(
      Effect.gen(function* claimGen() {
        seen.claimFiber = yield* Effect.fiberId;
        return Deferred.await(gate).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              seen.joined = true;
            })
          )
        );
      })
    );
    const event = {
      type: "entity_changed",
      caseId: "11111111-1111-4111-8111-000000000001",
    };
    const callerFiber = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* handleGen() {
          const id = yield* Effect.fiberId;
          yield* handleExportEventPayloadEffect(JSON.stringify(event));
          return id;
        }),
        Db.layer
      )
    );
    // Returned without waiting on the held wait: claimed in the caller's
    // fiber, and the wait has not completed.
    expect(seen.claimFiber).toBe(callerFiber);
    expect(seen.joined).toBe(false);
    await Effect.runPromise(Deferred.succeed(gate, undefined));
  });

  it("ignores watchdog events with empty or invalid caseId", async () => {
    await Effect.runPromise(
      Effect.provide(
        handleExportEventPayloadEffect(
          JSON.stringify({ type: "entity_changed", caseId: "   " })
        ),
        Db.layer
      )
    );
    expect(claimExportEventEffect).not.toHaveBeenCalled();
  });

  it("ignores non-triggering watchdog events without forking export", async () => {
    await Effect.runPromise(
      Effect.provide(
        handleExportEventPayloadEffect(
          JSON.stringify({
            type: "task_changed",
            caseId: "11111111-1111-4111-8111-000000000001",
          })
        ),
        Db.layer
      )
    );
    expect(claimExportEventEffect).not.toHaveBeenCalled();
  });
});
