import { env } from "@watchdog/env/server";

const DAY_MS = 86_400_000;

/** The restore window when `WD_CASE_RETENTION_DAYS` is unset: how long a deleted Case stays restorable. */
export const DEFAULT_CASE_RETENTION_DAYS = 30;

/**
 * Days a deleted Case stays restorable (`WD_CASE_RETENTION_DAYS`, default 30). Read at call
 * time, so the delete dialog, the Deleted Cases list and the purge job always agree.
 */
export function caseRetentionDays(): number {
  // `env` is not validated under SKIP_ENV_VALIDATION (lint, unit tests): fall back to the default.
  const configured: number | undefined = env.WD_CASE_RETENTION_DAYS;
  return configured ?? DEFAULT_CASE_RETENTION_DAYS;
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
