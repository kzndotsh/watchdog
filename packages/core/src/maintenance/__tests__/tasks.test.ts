import { describe, expect, it } from "vitest";

import { repairRestoredActivityXidsEffect } from "../../activity/restore-check";
import { pruneActivityEffect } from "../../activity/retention";
import { purgeExpiredCasesEffect } from "../../case-deletion/purge";
import { sweepAbandonedUploadsEffect } from "../../evidence/upload-sweep";
import { sweepExpiredCaseExportsEffect } from "../../export/export-objects";
import { reconcileJobsEffect } from "../../jobs/lifecycle/reconcile";
import { pruneJobStartCountersEffect } from "../../jobs/start-limits-prune";
import {
  ACTIVITY_PRUNE,
  ACTIVITY_RESTORE_CHECK,
  CASE_PURGE,
  EXPORT_SWEEP,
  JOB_RECONCILE,
  JOB_START_PRUNE,
  MAINTENANCE_TASKS,
  UPLOAD_SWEEP,
} from "../index";
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

describe("registered maintenance tasks", () => {
  // The table names what each task must call and how it must report; the
  // assertions read the registered tasks, so a wrong Effect, report or
  // schedule in `MAINTENANCE_TASKS` fails here.
  const expected = [
    [
      JOB_RECONCILE,
      "worker.reconcile",
      "60 seconds",
      true,
      reconcileJobsEffect,
      reconcileReport,
    ],
    [
      ACTIVITY_PRUNE,
      "activity.retention",
      "24 hours",
      undefined,
      pruneActivityEffect,
      activityPruneReport,
    ],
    [
      CASE_PURGE,
      "case.purge.run",
      "1 hour",
      undefined,
      purgeExpiredCasesEffect,
      casePurgeReport,
    ],
    [
      UPLOAD_SWEEP,
      "evidence.upload-sweep.run",
      "1 hour",
      undefined,
      sweepAbandonedUploadsEffect,
      uploadSweepReport,
    ],
    [
      JOB_START_PRUNE,
      "jobs.start-limits.prune",
      "1 hour",
      undefined,
      pruneJobStartCountersEffect,
      jobStartPruneReport,
    ],
    [
      EXPORT_SWEEP,
      "export.sweep.run",
      "1 hour",
      undefined,
      sweepExpiredCaseExportsEffect,
      exportSweepReport,
    ],
  ] as const;

  it("registers exactly these tasks, in this order", () => {
    expect(MAINTENANCE_TASKS).toEqual(expected.map(([task]) => task));
  });

  it.each(expected)(
    "%# calls its core Effect on its schedule and reports through its mapping",
    (task, name, every, delayFirst, source, report) => {
      expect(task.name).toBe(name);
      expect(task.every).toBe(every);
      expect(task.delayFirst).toBe(delayFirst);
      expect(task.source).toBe(source);
      expect(task.report).toBe(report);
    }
  );

  it("the boot restore check calls the restore Effect", () => {
    expect(ACTIVITY_RESTORE_CHECK.name).toBe("activity.restore");
    expect(ACTIVITY_RESTORE_CHECK.source).toBe(
      repairRestoredActivityXidsEffect
    );
    expect(ACTIVITY_RESTORE_CHECK.report).toBe(activityRestoreReport);
  });
});

describe("maintenance reports", () => {
  it("reconcile reports every counter, each on its own", () => {
    for (const counter of [
      "stale",
      "accessRevoked",
      "stuckPlaybooks",
      "orphanedQueued",
      "collectQueueRebuilt",
    ] as const) {
      expect(reconcileReport({ ...QUIET, [counter]: 2 })).toMatchObject({
        [counter]: 2,
      });
    }
  });

  it("reconcile is quiet when nothing changed and when the lock is held", () => {
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
