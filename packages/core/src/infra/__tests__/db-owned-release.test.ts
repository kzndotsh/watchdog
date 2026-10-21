import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const logger = vi.hoisted(() => ({
  error: vi.fn(),
  emit: vi.fn(async () => {}),
}));
vi.mock("@watchdog/log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@watchdog/log")>()),
  createLogger: vi.fn(() => logger),
}));

import { Db } from "../db-service";

describe("Db.ownedBy release", () => {
  it("logs a failed pool end and lets shutdown continue instead of dying", async () => {
    const db = await Effect.runPromise(
      Db.use(Effect.succeed).pipe(Effect.provide(Db.layer))
    );
    const failure = new Error("end failed");
    const later: string[] = [];

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* shutdownGen() {
          // Registered first, so it runs after the pool's release.
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              later.push("next finalizer");
            })
          );
          yield* Effect.provide(
            Db,
            Db.ownedBy(() => ({
              db,
              end: async () => {
                throw failure;
              },
            }))
          ).pipe(Effect.asVoid);
        })
      )
    );

    expect(logger.error).toHaveBeenCalledWith(failure);
    expect(later).toEqual(["next finalizer"]);
  });
});
