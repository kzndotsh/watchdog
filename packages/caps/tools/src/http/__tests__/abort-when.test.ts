import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { abortWhen } from "../abort-when";

describe("abortWhen", () => {
  it("interrupts immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const exit = await Effect.runPromiseExit(abortWhen(controller.signal));
    expect(exit._tag).toBe("Failure");
  });

  it("interrupts when the signal aborts later", async () => {
    const controller = new AbortController();
    const exit = await Effect.runPromiseExit(
      abortWhen(controller.signal).pipe(
        Effect.raceFirst(
          Effect.sync(() => {
            controller.abort();
          }).pipe(Effect.andThen(Effect.never))
        )
      )
    );
    expect(exit._tag).toBe("Failure");
  });
});
