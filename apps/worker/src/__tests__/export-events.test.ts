import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WatchdogEvent } from "@watchdog/schemas/feed";
import type { CaseId } from "@watchdog/schemas/shared";

const { claimCaseExportEffect } = vi.hoisted(() => ({
  claimCaseExportEffect: vi.fn(() => Effect.succeed(Effect.void)),
}));

vi.mock("@watchdog/core/worker", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/core/worker")>();
  return {
    ...actual,
    claimCaseExportEffect,
  };
});

import { Db, recordingBlobStore, fakeVault } from "@watchdog/core/worker";

import {
  claimExportEventEffect,
  hasSchedulableCaseId,
  normalizeSchedulableCaseId,
  shouldTriggerCaseExport,
} from "../export-events";

const workerTestServices = Layer.mergeAll(
  Db.layer,
  recordingBlobStore().layer,
  fakeVault().layer
);

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

describe("claimExportEventEffect", () => {
  const caseId = "11111111-1111-4111-8111-000000000001";

  beforeEach(() => {
    claimCaseExportEffect.mockReset();
    claimCaseExportEffect.mockReturnValue(Effect.succeed(Effect.void));
  });

  it("propagates export scheduling defects from the claim", async () => {
    claimCaseExportEffect.mockReturnValueOnce(
      Effect.die(new Error("disk full"))
    );

    await expect(
      Effect.runPromise(
        Effect.provide(
          claimExportEventEffect({ type: "entity_changed", caseId }),
          workerTestServices
        )
      )
    ).rejects.toThrow(/disk full/);
  });

  it("skips export for non-triggering events", async () => {
    await Effect.runPromise(
      Effect.flatten(
        Effect.provide(
          claimExportEventEffect({ type: "task_changed", caseId }),
          workerTestServices
        )
      )
    );

    expect(claimCaseExportEffect).not.toHaveBeenCalled();
  });

  it("claims export with a trimmed case id", async () => {
    const paddedCaseId = `  ${caseId}  `;

    await Effect.runPromise(
      Effect.flatten(
        Effect.provide(
          claimExportEventEffect({
            type: "entity_changed",
            caseId: paddedCaseId,
          }),
          workerTestServices
        )
      )
    );

    expect(claimCaseExportEffect).toHaveBeenCalledWith(caseId);
  });

  it("skips export when case id is not schedulable", async () => {
    await Effect.runPromise(
      Effect.flatten(
        Effect.provide(
          claimExportEventEffect({
            type: "entity_changed",
            caseId: "not-a-uuid",
          }),
          workerTestServices
        )
      )
    );

    expect(claimCaseExportEffect).not.toHaveBeenCalled();
  });
});

describe("normalizeSchedulableCaseId (ADR-0003)", () => {
  it("mints a CaseId from a padded uuid and rejects anything else", () => {
    const id = "11111111-1111-4111-8111-000000000001";
    const minted: CaseId | null = normalizeSchedulableCaseId(`  ${id}  `);
    expect(minted).toBe(id);
    expect(normalizeSchedulableCaseId("not-a-uuid")).toBeNull();
  });

  it("returns a CaseId, so a plain string cannot stand in for it", () => {
    const id = normalizeSchedulableCaseId(
      "11111111-1111-4111-8111-000000000001"
    );
    // @ts-expect-error the result is CaseId | null: narrow it before use
    const notNarrowed: CaseId = id;
    expect(notNarrowed).toBeDefined();
  });
});
