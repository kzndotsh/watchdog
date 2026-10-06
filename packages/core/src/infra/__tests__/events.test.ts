import { Effect } from "effect";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { testCaseId, untrustedCaseId } from "@watchdog/schemas/testing";

import { notifyEntityChangedEffect } from "../events";

const notifyEvent = vi.fn();

vi.mock("@watchdog/db", () => ({
  notifyEvent: (...args: unknown[]) => notifyEvent(...args),
}));

describe("notify* effects", () => {
  beforeEach(() => {
    notifyEvent.mockReset();
    notifyEvent.mockResolvedValue(undefined);
  });

  it("skips invalid watchdog events", async () => {
    await Effect.runPromise(
      notifyEntityChangedEffect(untrustedCaseId("not-a-uuid"))
    );
    expect(notifyEvent).not.toHaveBeenCalled();
  });

  it("normalizes padded case ids on emit", async () => {
    const caseId = testCaseId(1);
    await Effect.runPromise(
      notifyEntityChangedEffect(untrustedCaseId(`  ${caseId}  `))
    );
    expect(notifyEvent).toHaveBeenCalledWith({
      type: "entity_changed",
      caseId,
    });
  });
});
