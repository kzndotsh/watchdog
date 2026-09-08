import { Effect } from "effect";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  notifyEntityChangedEffect,
  notifyEvidenceChangedEffect,
  notifyJobUpdateEffect,
} from "../events";

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
    await Effect.runPromise(notifyEntityChangedEffect("not-a-uuid"));
    expect(notifyEvent).not.toHaveBeenCalled();
  });

  it("normalizes padded case ids on emit", async () => {
    const caseId = testId(1);
    await Effect.runPromise(notifyEntityChangedEffect(`  ${caseId}  `));
    expect(notifyEvent).toHaveBeenCalledWith({
      type: "entity_changed",
      caseId,
    });
  });

  it("skips evidence_changed when evidenceId is invalid", async () => {
    const caseId = testId(2);
    await Effect.runPromise(notifyEvidenceChangedEffect(caseId, "not-a-uuid"));
    expect(notifyEvent).not.toHaveBeenCalled();
  });

  it("emits job_update with trimmed ids", async () => {
    const caseId = testId(3);
    const jobId = testId(4);
    await Effect.runPromise(
      notifyJobUpdateEffect(` ${caseId} `, ` ${jobId} `, "queued")
    );
    expect(notifyEvent).toHaveBeenCalledWith({
      type: "job_update",
      caseId,
      jobId,
      status: "queued",
    });
  });
});
