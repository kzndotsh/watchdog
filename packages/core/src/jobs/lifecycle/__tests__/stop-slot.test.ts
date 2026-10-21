import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { JOB_STOP_CAUSES } from "@watchdog/schemas/shared";

import { makeStopSlot, stopEvent, stopMessage } from "../stop-slot";

describe("stop slot", () => {
  it("keeps the first stop and refuses the rest", async () => {
    const slot = makeStopSlot();
    expect(await Effect.runPromise(slot.peek)).toBeNull();
    expect(
      await Effect.runPromise(
        slot.offer({ cause: "cap_timeout", detail: "Timed out after 1s" })
      )
    ).toBe(true);
    expect(
      await Effect.runPromise(slot.offer({ cause: "queue_aborted" }))
    ).toBe(false);
    expect(await Effect.runPromise(slot.peek)).toEqual({
      cause: "cap_timeout",
      detail: "Timed out after 1s",
    });
  });

  it("settles a stop a person (or a lost Case or access) chose as a cancel, every other as a failure", () => {
    const cancelling = JOB_STOP_CAUSES.filter(
      (cause) => stopEvent(cause).kind === "cancel"
    );
    expect(cancelling).toEqual([
      "user_cancelled",
      "case_deleted",
      "access_revoked",
    ]);
    for (const cause of JOB_STOP_CAUSES) {
      const event = stopEvent(cause);
      expect(event).toMatchObject({ cause });
    }
  });

  it("words a stop from its detail, else from its cause", () => {
    expect(stopMessage({ cause: "cap_timeout" })).toBe("Timed out");
    expect(stopMessage({ cause: "queue_aborted", detail: "gone" })).toBe(
      "gone"
    );
    expect(stopMessage({ cause: "worker_shutdown" })).toBe("aborted");
  });
});
