import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WatchdogEvent } from "@watchdog/core";

const { scheduleCaseExportEffect } = vi.hoisted(() => ({
  scheduleCaseExportEffect: vi.fn(() => Effect.void),
}));

vi.mock("@watchdog/core/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/worker")>();
  return {
    ...actual,
    scheduleCaseExportEffect,
  };
});

import {
  handleExportEventEffect,
  hasSchedulableCaseId,
  shouldTriggerCaseExport,
} from "../export-events";

describe("shouldTriggerCaseExport", () => {
  const caseId = "11111111-1111-4111-8111-000000000001";

  it("returns true for a succeeded job_update", () => {
    const event: WatchdogEvent = {
      type: "job_update",
      caseId,
      jobId: "22222222-2222-4222-8222-000000000002",
      status: "succeeded",
    };
    expect(shouldTriggerCaseExport(event)).toBe(true);
  });

  it("returns false for a failed job_update", () => {
    const event: WatchdogEvent = {
      type: "job_update",
      caseId,
      jobId: "22222222-2222-4222-8222-000000000002",
      status: "failed",
    };
    expect(shouldTriggerCaseExport(event)).toBe(false);
  });

  it("returns true for entity_changed", () => {
    const event: WatchdogEvent = { type: "entity_changed", caseId };
    expect(shouldTriggerCaseExport(event)).toBe(true);
  });

  it("returns true for evidence_changed", () => {
    const event: WatchdogEvent = {
      type: "evidence_changed",
      caseId,
      evidenceId: "22222222-2222-4222-8222-000000000002",
    };
    expect(shouldTriggerCaseExport(event)).toBe(true);
  });

  it("returns false for proposal_created", () => {
    const event: WatchdogEvent = {
      type: "proposal_created",
      caseId,
      proposalId: "22222222-2222-4222-8222-000000000002",
    };
    expect(shouldTriggerCaseExport(event)).toBe(false);
  });

  it("returns false for proposal_queue_changed", () => {
    const event: WatchdogEvent = { type: "proposal_queue_changed", caseId };
    expect(shouldTriggerCaseExport(event)).toBe(false);
  });

  it("returns false for task_changed", () => {
    const event: WatchdogEvent = { type: "task_changed", caseId };
    expect(shouldTriggerCaseExport(event)).toBe(false);
  });
});

describe("hasSchedulableCaseId", () => {
  it("accepts canonical UUIDs", () => {
    expect(hasSchedulableCaseId("11111111-1111-4111-8111-000000000001")).toBe(
      true
    );
    expect(
      hasSchedulableCaseId("  11111111-1111-4111-8111-000000000001  ")
    ).toBe(true);
  });

  it("rejects empty, whitespace-only, and non-uuid values", () => {
    expect(hasSchedulableCaseId("")).toBe(false);
    expect(hasSchedulableCaseId("   ")).toBe(false);
    expect(hasSchedulableCaseId("not-a-uuid")).toBe(false);
  });
});

describe("handleExportEventEffect", () => {
  const caseId = "11111111-1111-4111-8111-000000000001";

  beforeEach(() => {
    scheduleCaseExportEffect.mockReset();
    scheduleCaseExportEffect.mockReturnValue(Effect.void);
  });

  it("propagates export scheduling failures", async () => {
    scheduleCaseExportEffect.mockReturnValueOnce(
      Effect.fail(new Error("disk full"))
    );

    await expect(
      Effect.runPromise(
        handleExportEventEffect({ type: "entity_changed", caseId })
      )
    ).rejects.toThrow(/disk full/);
  });

  it("skips export for non-triggering events", async () => {
    await Effect.runPromise(
      handleExportEventEffect({ type: "task_changed", caseId })
    );

    expect(scheduleCaseExportEffect).not.toHaveBeenCalled();
  });

  it("schedules export with a trimmed case id", async () => {
    const paddedCaseId = `  ${caseId}  `;

    await Effect.runPromise(
      handleExportEventEffect({ type: "entity_changed", caseId: paddedCaseId })
    );

    expect(scheduleCaseExportEffect).toHaveBeenCalledWith(caseId);
  });

  it("skips export when case id is not schedulable", async () => {
    await Effect.runPromise(
      handleExportEventEffect({ type: "entity_changed", caseId: "not-a-uuid" })
    );

    expect(scheduleCaseExportEffect).not.toHaveBeenCalled();
  });
});
