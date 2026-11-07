import { describe, expect, it } from "vitest";

import { MAINTENANCE_TASKS, ACTIVITY_RESTORE_CHECK } from "../index";
import {
  activityPruneReport,
  activityRestoreReport,
  casePurgeReport,
  exportSweepReport,
  jobStartPruneReport,
  reconcileReport,
  uploadSweepReport,
} from "../reports";

const QUIET = {
  ran: true,
  stale: 0,
  accessRevoked: 0,
  stuckPlaybooks: 0,
  orphanedQueued: 0,
  collectQueueRebuilt: 0,
};

describe("maintenance tasks", () => {
  it("keeps the schedules and log names the worker has always used", () => {
    expect(
      MAINTENANCE_TASKS.map((task) => [task.name, task.every, task.delayFirst])
    ).toEqual([
      ["worker.reconcile", "60 seconds", true],
      ["activity.retention", "24 hours", undefined],
      ["case.purge.run", "1 hour", undefined],
      ["evidence.upload-sweep.run", "1 hour", undefined],
      ["jobs.start-limits.prune", "1 hour", undefined],
      ["export.sweep.run", "1 hour", undefined],
    ]);
    expect(ACTIVITY_RESTORE_CHECK.name).toBe("activity.restore");
  });
});

describe("maintenance reports", () => {
  it("reconcile reports only a repair, and nothing when the lock is held", () => {
    expect(reconcileReport({ ...QUIET, accessRevoked: 2 })).toMatchObject({
      accessRevoked: 2,
    });
    expect(reconcileReport(QUIET)).toBeUndefined();
    expect(reconcileReport({ ...QUIET, ran: false, stale: 3 })).toBeUndefined();
  });

  it("activity prune reports what it pruned", () => {
    expect(activityPruneReport({ pruned: 12, batches: 1 })).toMatchObject({
      pruned: 12,
      batches: 1,
    });
    expect(activityPruneReport({ pruned: 0, batches: 0 })).toBeUndefined();
  });

  it("case purge reports purged and failed, and is quiet when nothing was due", () => {
    expect(casePurgeReport({ purged: 2, failed: 1, skipped: 0 })).toMatchObject(
      { purged: 2, failed: 1 }
    );
    expect(casePurgeReport({ purged: 0, failed: 1, skipped: 0 })).toMatchObject(
      { failed: 1 }
    );
    expect(
      casePurgeReport({ purged: 0, failed: 0, skipped: 0 })
    ).toBeUndefined();
  });

  it("upload sweep, start counter prune and export sweep report only a removal", () => {
    expect(uploadSweepReport({ swept: 3 })).toMatchObject({ swept: 3 });
    expect(uploadSweepReport({ swept: 0 })).toBeUndefined();
    expect(jobStartPruneReport({ removed: 4 })).toMatchObject({ removed: 4 });
    expect(jobStartPruneReport({ removed: 0 })).toBeUndefined();
    expect(exportSweepReport(5)).toMatchObject({ swept: 5 });
    expect(exportSweepReport(0)).toBeUndefined();
  });

  it("the restore check announces a repair and is silent on a healthy log", () => {
    expect(activityRestoreReport({ repaired: 7 })).toMatchObject({
      repaired: 7,
    });
    expect(activityRestoreReport({ repaired: 0 })).toBeUndefined();
  });
});
