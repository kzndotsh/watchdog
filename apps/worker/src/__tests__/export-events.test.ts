import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVITY_ENTRY_ACTIONS,
  ACTIVITY_ENTRY_KINDS,
  type ActivityEntry,
  type ActivityEntryKind,
} from "@watchdog/schemas/feed";
import { asCaseId, type CaseId } from "@watchdog/schemas/shared";
import { untrustedCaseId } from "@watchdog/schemas/testing";

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
  claimExportEntryEffect,
  hasSchedulableCaseId,
  normalizeSchedulableCaseId,
  shouldTriggerCaseExport,
} from "../export-events";

const workerTestServices = Layer.mergeAll(
  Db.layer,
  recordingBlobStore().layer,
  fakeVault().layer
);

const CASE_ID = asCaseId("11111111-1111-4111-8111-000000000001");

function entryOf(
  kind: ActivityEntryKind,
  action: string,
  caseId: CaseId = CASE_ID
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

const GRAPH_KINDS = new Set<ActivityEntryKind>([
  "entity",
  "edge",
  "claim",
  "identifier",
  "event",
  "question",
]);

/** Every (kind, action) the log can hold, from the closed verb list. */
const ALL_ENTRIES = ACTIVITY_ENTRY_KINDS.flatMap((kind) =>
  ACTIVITY_ENTRY_ACTIONS[kind].map((action) => entryOf(kind, action))
);

function label(entry: ActivityEntry): string {
  return `${entry.kind}.${entry.action}`;
}

describe("shouldTriggerCaseExport", () => {
  it("exports exactly: a succeeded Job, any Evidence entry, any Graph kind", () => {
    const triggering = ALL_ENTRIES.filter((entry) =>
      shouldTriggerCaseExport(entry)
    ).map(label);
    const expected = ALL_ENTRIES.filter(
      (entry) =>
        (entry.kind === "job" && entry.action === "succeeded") ||
        entry.kind === "evidence" ||
        GRAPH_KINDS.has(entry.kind)
    ).map(label);
    expect([...triggering].sort()).toEqual([...expected].sort());
    // Spot checks that pin the derived table above to the intent.
    expect(triggering).toContain("job.succeeded");
    expect(triggering).toContain("evidence.captured");
    expect(triggering).toContain("entity.deleted");
    expect(triggering).toContain("claim.retracted");
    expect(triggering).toContain("question.resolved");
  });

  it("does not export for Task entries", () => {
    for (const action of ACTIVITY_ENTRY_ACTIONS.task) {
      expect(shouldTriggerCaseExport(entryOf("task", action))).toBe(false);
    }
  });

  it("does not export for Proposal entries", () => {
    for (const action of ACTIVITY_ENTRY_ACTIONS.proposal) {
      expect(shouldTriggerCaseExport(entryOf("proposal", action))).toBe(false);
    }
  });

  it("does not export for a Job that has not succeeded", () => {
    for (const action of ["queued", "running", "failed", "cancelled"]) {
      expect(shouldTriggerCaseExport(entryOf("job", action))).toBe(false);
    }
  });

  it("does not export for a Case update (it schedules its own export)", () => {
    expect(shouldTriggerCaseExport(entryOf("case", "updated"))).toBe(false);
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

describe("claimExportEntryEffect", () => {
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
          claimExportEntryEffect(entryOf("entity", "updated")),
          workerTestServices
        )
      )
    ).rejects.toThrow(/disk full/);
  });

  it("skips export for non-triggering entries", async () => {
    await Effect.runPromise(
      Effect.flatten(
        Effect.provide(
          claimExportEntryEffect(entryOf("task", "created")),
          workerTestServices
        )
      )
    );

    expect(claimCaseExportEffect).not.toHaveBeenCalled();
  });

  it("claims export with a trimmed case id", async () => {
    await Effect.runPromise(
      Effect.flatten(
        Effect.provide(
          claimExportEntryEffect(
            entryOf("entity", "updated", untrustedCaseId(`  ${CASE_ID}  `))
          ),
          workerTestServices
        )
      )
    );

    expect(claimCaseExportEffect).toHaveBeenCalledWith(CASE_ID);
  });

  it("skips export when case id is not schedulable", async () => {
    await Effect.runPromise(
      Effect.flatten(
        Effect.provide(
          claimExportEntryEffect(
            entryOf("entity", "updated", untrustedCaseId("not-a-uuid"))
          ),
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
