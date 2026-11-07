import { env } from "@watchdog/env/server";

import { DAY_MS } from "../infra/clock";

/**
 * Days a deleted Case stays restorable (`WD_CASE_RETENTION_DAYS`). Read at call
 * time, so the delete dialog, the Deleted Cases list and the purge job always agree.
 */
export function caseRetentionDays(): number {
  return env.WD_CASE_RETENTION_DAYS;
}

/**
 * The instant a Case deleted at `deletedAt` stops being restorable (the scheduled purge takes it
 * from then on). Computed once, at delete time, and stored (`cases.purge_after`): a later change
 * of `WD_CASE_RETENTION_DAYS` does not move the date of a Case that is already deleted.
 */
export function purgeDueAt(deletedAt: Date, retentionDays: number): Date {
  return new Date(deletedAt.getTime() + retentionDays * DAY_MS);
}

/** Whole days until `purgeAfter`, rounded up (3 hours left is 1 day), never below 0. */
export function daysUntilPurge(purgeAfter: Date, now: Date): number {
  return Math.max(
    0,
    Math.ceil((purgeAfter.getTime() - now.getTime()) / DAY_MS)
  );
}
