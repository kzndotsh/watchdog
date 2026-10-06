import { Deferred, Effect, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityEntry, ActivityEntryKind } from "@watchdog/schemas/feed";
import { testCaseId } from "@watchdog/schemas/testing";

const { claimCaseExportEffect } = vi.hoisted(() => ({
  claimCaseExportEffect: vi.fn((_caseId: string) =>
    Effect.succeed(Effect.void)
  ),
}));

vi.mock("@watchdog/core/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/worker")>();
  return {
    ...actual,
    claimCaseExportEffect,
  };
});

import { Db, recordingBlobStore, fakeVault } from "@watchdog/core/worker";

import { handleExportEntryEffect, rescanAllCasesEffect } from "../boot-worker";

const workerTestServices = Layer.mergeAll(
  Db.layer,
  recordingBlobStore().layer,
  fakeVault().layer
);

const CASE_ID = "11111111-1111-4111-8111-000000000001";

function entryOf(
  kind: ActivityEntryKind,
  action: string,
  caseId: string = CASE_ID
): ActivityEntry {
  return {
    cursor: "10:1",
    id: 1,
    caseId,
    kind,
    action,
    subjectId: null,
    groupId: null,
    label: null,
    actorId: null,
    actorLabel: null,
    fromValue: null,
    toValue: null,
    at: "2026-10-06T00:00:00.000Z",
  };
}

describe("handleExportEntryEffect", () => {
  beforeEach(() => {
    claimCaseExportEffect.mockReset();
    claimCaseExportEffect.mockReturnValue(Effect.succeed(Effect.void));
  });

  it("claims the Case export for a Graph entry", async () => {
    await Effect.runPromise(
      Effect.provide(
        handleExportEntryEffect(entryOf("entity", "updated")),
        workerTestServices
      )
    );
    expect(claimCaseExportEffect).toHaveBeenCalledWith(CASE_ID);
  });

  it("claims the Case export for Evidence and a succeeded Job", async () => {
    await Effect.runPromise(
      Effect.provide(
        Effect.all([
          handleExportEntryEffect(entryOf("evidence", "hidden")),
          handleExportEntryEffect(entryOf("job", "succeeded")),
        ]),
        workerTestServices
      )
    );
    expect(claimCaseExportEffect).toHaveBeenCalledTimes(2);
  });

  it("claims nothing for Task and Proposal entries", async () => {
    await Effect.runPromise(
      Effect.provide(
        Effect.all([
          handleExportEntryEffect(entryOf("task", "created")),
          handleExportEntryEffect(entryOf("task", "status_changed")),
          handleExportEntryEffect(entryOf("proposal", "created")),
          handleExportEntryEffect(entryOf("proposal", "accepted")),
          handleExportEntryEffect(entryOf("job", "running")),
        ]),
        workerTestServices
      )
    );
    expect(claimCaseExportEffect).not.toHaveBeenCalled();
  });

  it("marks the case before forking, so an interrupted child cannot lose the mark", async () => {
    // The claim must run in the caller's fiber (before the fork). A claim that
    // ran inside the forked child would see a different fiber id.
    const seen: { claimFiber?: number; joined: boolean } = { joined: false };
    const gate = Deferred.makeUnsafe<undefined>();
    claimCaseExportEffect.mockReturnValue(
      Effect.gen(function* claimGen() {
        seen.claimFiber = yield* Effect.fiberId;
        // oxlint-disable-next-line effecttsgo/return-effect-in-gen -- the claim's result IS an Effect (the wait to fork), so `Effect<Effect>` is the contract under test
        return Deferred.await(gate).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              seen.joined = true;
            })
          )
        );
      })
    );
    const callerFiber = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* handleGen() {
          const id = yield* Effect.fiberId;
          yield* handleExportEntryEffect(entryOf("entity", "created"));
          return id;
        }),
        workerTestServices
      )
    );
    // Returned without waiting on the held wait: claimed in the caller's
    // fiber, and the wait has not completed.
    expect(seen.claimFiber).toBe(callerFiber);
    expect(seen.joined).toBe(false);
    await Effect.runPromise(Deferred.succeed(gate, undefined));
  });

  it("ignores entries with an empty or invalid caseId", async () => {
    await Effect.runPromise(
      Effect.provide(
        Effect.all([
          handleExportEntryEffect(entryOf("entity", "created", "   ")),
          handleExportEntryEffect(entryOf("entity", "created", "nope")),
        ]),
        workerTestServices
      )
    );
    expect(claimCaseExportEffect).not.toHaveBeenCalled();
  });

  it("fails (and so ends the consumer before its cursor moves) when the claim defects", async () => {
    claimCaseExportEffect.mockReturnValueOnce(Effect.die(new Error("no disk")));
    await expect(
      Effect.runPromise(
        Effect.provide(
          handleExportEntryEffect(entryOf("entity", "created")),
          workerTestServices
        )
      )
    ).rejects.toThrow(/no disk/);
  });
});

describe("rescanAllCasesEffect", () => {
  beforeEach(() => {
    claimCaseExportEffect.mockReset();
    claimCaseExportEffect.mockReturnValue(Effect.succeed(Effect.void));
  });

  it("claims an export for every Case it is given", async () => {
    const ids = [testCaseId(1), testCaseId(2)];
    await Effect.runPromise(
      Effect.provide(rescanAllCasesEffect(ids), workerTestServices)
    );
    expect(claimCaseExportEffect.mock.calls.map(([id]) => id)).toEqual(ids);
  });

  it("does nothing for an empty database", async () => {
    await Effect.runPromise(
      Effect.provide(rescanAllCasesEffect([]), workerTestServices)
    );
    expect(claimCaseExportEffect).not.toHaveBeenCalled();
  });
});
