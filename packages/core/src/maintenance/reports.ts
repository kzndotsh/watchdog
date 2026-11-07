import type { RepairRestoredXidsResult } from "../activity/restore-check";
import type { PruneActivityResult } from "../activity/retention";
import type { PurgeRunSummary } from "../case-deletion/purge";
import type { UploadSweepSummary } from "../evidence/upload-sweep";
import type { JobReconcileResult } from "../jobs/lifecycle/reconcile";
import type { JobStartPruneSummary } from "../jobs/start-limits-prune";

/** What a run reports: the wide event's `message` and fields. */
export type MaintenanceReport = {
  readonly message: string;
  readonly [field: string]: unknown;
};

/*
 * What each task says about a run. `undefined` is quiet: nothing was due, so
 * a healthy worker logs nothing hourly.
 */

/** A tick another worker holds the lock for (`ran: false`) says nothing. */
export function reconcileReport(
  result: JobReconcileResult
): MaintenanceReport | undefined {
  const {
    ran,
    stale,
    accessRevoked,
    stuckPlaybooks,
    orphanedQueued,
    collectQueueRebuilt,
  } = result;
  const changed =
    stale +
    accessRevoked +
    stuckPlaybooks +
    orphanedQueued +
    collectQueueRebuilt;
  if (!ran || changed === 0) return undefined;
  return {
    message: `reconciled Jobs: ${stale} stale, ${accessRevoked} access revoked, ${stuckPlaybooks} stuck playbook run(s), ${orphanedQueued} orphaned queued re-enqueued, ${collectQueueRebuilt} Collect queue Case(s) rebuilt`,
    stale,
    accessRevoked,
    stuckPlaybooks,
    orphanedQueued,
    collectQueueRebuilt,
  };
}

export function activityPruneReport({
  pruned,
  batches,
}: PruneActivityResult): MaintenanceReport | undefined {
  return pruned > 0
    ? { message: `pruned ${pruned} activity entries`, pruned, batches }
    : undefined;
}

export function casePurgeReport({
  purged,
  failed,
}: PurgeRunSummary): MaintenanceReport | undefined {
  return purged > 0 || failed > 0
    ? {
        message: `purged ${purged} deleted Case(s), ${failed} failed and will be retried`,
        purged,
        failed,
      }
    : undefined;
}

export function uploadSweepReport({
  swept,
}: UploadSweepSummary): MaintenanceReport | undefined {
  return swept > 0
    ? { message: `removed ${swept} abandoned upload(s)`, swept }
    : undefined;
}

export function jobStartPruneReport({
  removed,
}: JobStartPruneSummary): MaintenanceReport | undefined {
  return removed > 0
    ? { message: `removed ${removed} ended Job start counter(s)`, removed }
    : undefined;
}

export function exportSweepReport(
  swept: number
): MaintenanceReport | undefined {
  return swept > 0
    ? { message: `removed ${swept} expired export archive(s)`, swept }
    : undefined;
}

export function activityRestoreReport({
  repaired,
}: RepairRestoredXidsResult): MaintenanceReport | undefined {
  return repaired > 0
    ? {
        message: `restored database: rewrote ${repaired} activity xid(s) to 0`,
        repaired,
      }
    : undefined;
}
